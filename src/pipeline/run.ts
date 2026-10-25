/**
 * runPipeline: the 10-step Signal Loop pipeline as one runtime-agnostic orchestrator.
 * The Workflow wraps every step in step.do (deps.runStep); Node scripts call it directly.
 * Every step emits a RunStep row (running → passed/warned/failed/skipped) through deps.onStep,
 * which is what the Run view animates from.
 */
import type { Delivery, Evidence, ExtractionOutput, Insight, Notification, RunStep, ScreenOutput, StepKey, StepStatus, Turn } from '../shared/contracts.ts';
import { ExtractionOutput as ExtractionSchema, ScreenOutput as ScreenSchema } from '../shared/contracts.ts';
import { conversationBlock, renderTranscript } from '../shared/prompts/context.ts';
import { EXTRACT_JSON_SCHEMA, extractSystemPrompt, repairExtraction } from '../shared/prompts/extract.ts';
import { heuristicInjection, repairScreen, SCREEN_JSON_SCHEMA, SCREEN_SYSTEM } from '../shared/prompts/screen.ts';
import { fallbackThemeName, repairThemeNames, THEME_NAME_JSON_SCHEMA, THEME_NAME_SYSTEM, ThemeNameOutput, themeNamePrompt } from '../shared/prompts/themeName.ts';
import { deliverInsight, routedNotification, TYPE_LABEL } from './deliver.ts';
import { groundQuote, normalize } from './ground.ts';
import { parseDocument } from './parse.ts';
import { redactDocument, redactionSummary } from './redact.ts';
import { routeInsight, type RouteDecision } from './route.ts';
import { scoreInsight } from './score.ts';
import { assignThemes, themeText } from './theme.ts';
import { LlmFailure, type LlmMeta, type LlmRequest, type NewTheme, type PipelineDeps, type PipelineInput, type PipelineResult, type ThemeCandidate } from './types.ts';
import { byteLength, randomId, round, sha256Hex } from './util.ts';

type StepOutcome<T> = {
  out: T;
  status?: StepStatus;
  summary: string;
  detail?: Record<string, unknown>;
  llm?: LlmMeta | null;
};

const PRODUCT_TERMS = ['Signal AI', 'Signal AI Studio', 'Signal Discovery', 'PreSense', 'Invoca', 'Google Ads', 'Salesforce', 'Genesys', 'Five9', 'Adobe', 'CallRail', 'Marchex', 'CallTrackingMetrics', 'WhatConverts', 'Gong', 'NICE', 'Meta'];

export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const now = () => deps.clock.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const ids = deps.ids ?? randomId;
  const steps: RunStep[] = [];
  const modelInputs: string[] = [];
  const t0 = now();

  const exec = async <T>(key: StepKey, fn: () => Promise<StepOutcome<T>>): Promise<T> => {
    let failedRow: RunStep | null = null;
    const wrapped = async (): Promise<{ out: T; row: RunStep; inputs: string[] }> => {
      const started = now();
      const inputsBefore = modelInputs.length;
      deps.telemetry?.stepStarted?.(key, iso(started));
      await deps.onStep?.({ runId: input.runId, key, status: 'running', startedAt: iso(started), finishedAt: null, durationMs: null, model: null, tokensIn: null, tokensOut: null, costUsd: null, summary: null, detail: null });
      try {
        const r = await fn();
        const finished = now();
        const row: RunStep = {
          runId: input.runId,
          key,
          status: r.status ?? 'passed',
          startedAt: iso(started),
          finishedAt: iso(finished),
          durationMs: Math.max(0, Math.round(finished - started)),
          model: r.llm?.model ?? null,
          tokensIn: r.llm ? r.llm.tokensIn : null,
          tokensOut: r.llm ? r.llm.tokensOut : null,
          costUsd: r.llm ? round(r.llm.costUsd, 6) : null,
          summary: r.summary,
          detail: r.detail ?? null,
        };
        await deps.onStep?.(row);
        deps.telemetry?.stepFinished?.(row);
        return { out: r.out, row, inputs: modelInputs.slice(inputsBefore) };
      } catch (err) {
        const finished = now();
        const row: RunStep = {
          runId: input.runId, key, status: 'failed', startedAt: iso(started), finishedAt: iso(finished), durationMs: Math.round(finished - started),
          model: err instanceof LlmFailure ? err.meta.model : null,
          tokensIn: err instanceof LlmFailure ? err.meta.tokensIn : null,
          tokensOut: err instanceof LlmFailure ? err.meta.tokensOut : null,
          costUsd: err instanceof LlmFailure ? round(err.meta.costUsd, 6) : null,
          summary: `Failed: ${errorMessage(err).slice(0, 160)}`,
          detail: { error: errorMessage(err), ...(err instanceof LlmFailure ? { attempts: err.meta.attempts, errors: err.meta.errors } : {}) },
        };
        failedRow = row;
        await deps.onStep?.(row);
        deps.telemetry?.stepFinished?.(row);
        throw err;
      }
    };
    let res: Awaited<ReturnType<typeof wrapped>>;
    try {
      res = deps.runStep ? await deps.runStep(key, wrapped) : await wrapped();
    } catch (err) {
      if (failedRow) steps.push(failedRow);
      throw err;
    }
    steps.push(res.row);
    // Inside a replayed Workflow, modelInputs are restored from the cached step result.
    if (deps.runStep) for (const s of res.inputs) if (!modelInputs.includes(s)) modelInputs.push(s);
    return res.out;
  };

  const result: PipelineResult = {
    status: 'failed', error: null, sha256: '', format: 'txt', steps, turns: [], redactions: [], screen: null, insights: [], deliveries: [], notifications: [],
    newThemes: [], costUsd: 0, durationMs: 0, injectionFlagged: false, actionable: null, modelInputs,
  };

  try {
    // 1 ---- ingest
    const ingest = await exec('ingest', async () => {
      const sha256 = await sha256Hex(input.content);
      const sizeBytes = byteLength(input.content);
      await deps.store.saveRawFile({ sha256, filename: input.filename, content: input.content, sizeBytes });
      await deps.store.updateRun(input.runId, { status: 'running', sha256 });
      return {
        out: { sha256, sizeBytes },
        summary: `Stored ${(sizeBytes / 1024).toFixed(1)} KB · sha256 ${sha256.slice(0, 12)}…`,
        detail: { sha256, sizeBytes, filename: input.filename, fileId: input.fileId, immutable: true },
      };
    });
    result.sha256 = ingest.sha256;

    // 2 ---- normalize
    const parsed = await exec('normalize', async () => {
      const doc = parseDocument(input.filename, input.content, { formatHint: input.formatHint ?? null, invocaNames: input.people.map((p) => p.name) });
      return {
        out: doc,
        status: doc.warnings.length ? 'warned' : 'passed',
        summary: `Parsed ${doc.turns.length} turn${doc.turns.length === 1 ? '' : 's'} from ${doc.format.toUpperCase()} · ${doc.speakers.length} speaker${doc.speakers.length === 1 ? '' : 's'}`,
        detail: { format: doc.format, turns: doc.turns.length, speakers: doc.speakers.length, roles: countBy(doc.turns.map((t) => t.role)), warnings: doc.warnings, subject: doc.subject ? '(subject present)' : null },
      };
    });
    result.format = parsed.format;

    // 3 ---- redact
    const red = await exec('redact', async () => {
      const contactNames = input.people.map((p) => p.name);
      const safeTerms = [...PRODUCT_TERMS, ...input.accounts.flatMap((a) => [a.name, a.name.split(' ')[0]!, a.hq.split(',')[0]!.trim()])];
      const doc = redactDocument(parsed.turns, { knownNames: contactNames, safeTerms });
      await deps.store.saveTranscript(input.runId, doc, parsed.format);
      const phi = doc.redactions.filter((r) => ['patient', 'dob', 'mrn', 'ssn'].includes(r.kind)).reduce((s, r) => s + r.count, 0);
      return {
        out: { text: doc.text, turns: doc.turns, redactions: doc.redactions },
        summary: redactionSummary(doc.redactions),
        detail: { total: doc.redactions.reduce((s, r) => s + r.count, 0), byKind: countBy(doc.redactions.flatMap((r) => Array<string>(r.count).fill(r.kind))), phi, tokens: doc.redactions.map((r) => r.token), onlyRedactedTextSentToModel: true },
      };
    });
    result.turns = red.turns;
    result.redactions = red.redactions;

    const transcript = renderTranscript(red.turns);
    const userBlock = conversationBlock({ filename: input.filename, format: parsed.format, account: input.account, now: t0, transcript });
    const extractRequest = (): LlmRequest<ExtractionOutput> => ({
      purpose: 'extract', system: extractSystemPrompt(input.promptVersion, input.taxonomy), prompt: userBlock, schema: ExtractionSchema, jsonSchema: EXTRACT_JSON_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'insights', maxTokens: 2500, runId: input.runId, repair: repairExtraction,
    });
    type Settled = { ok: true; data: ExtractionOutput; meta: LlmMeta } | { ok: false; err: unknown };
    const settleCall = (p: Promise<{ data: ExtractionOutput; meta: LlmMeta }>): Promise<Settled> => p.then((r) => ({ ok: true as const, ...r }), (err: unknown) => ({ ok: false as const, err }));
    let speculative: Promise<Settled> | null = null;

    // 4 ---- screen
    const screen = await exec('screen', async () => {
      const heuristic = heuristicInjection(red.text);
      modelInputs.push(userBlock);
      // Fast path: extraction starts now, in parallel; it is only used once screen has passed.
      if (deps.speculativeExtract && !speculative) speculative = settleCall(deps.llm.structured(extractRequest()));
      let out: ScreenOutput;
      let meta: LlmMeta | null = null;
      let fallback = false;
      try {
        const r = await deps.llm.structured({
          purpose: 'screen', system: SCREEN_SYSTEM, prompt: userBlock, schema: ScreenSchema, jsonSchema: SCREEN_JSON_SCHEMA as unknown as Record<string, unknown>,
          schemaName: 'screen', maxTokens: 400, runId: input.runId, repair: repairScreen,
        });
        out = r.data;
        meta = r.meta;
      } catch (err) {
        if (!(err instanceof LlmFailure)) throw err;
        meta = err.meta;
        fallback = true;
        await deps.store.recordDlq({ runId: input.runId, step: 'screen', error: err.message, payload: { errors: err.meta.errors } });
        // Fail safe, not open: extraction still runs, but nothing from this file is routed
        // without a person (see screenUnavailable below and scoreInsight's forced review).
        out = { actionable: true, language: 'en', injection_suspected: false, injection_excerpt: null, call_kind: 'other', reason: 'Screen unavailable; extracting, with every insight held for human review' };
      }
      const flagged = out.injection_suspected || !!heuristic;
      const screenOut: ScreenOutput = { ...out, injection_suspected: flagged, injection_excerpt: out.injection_excerpt ?? heuristic };
      await deps.store.saveScreen(input.runId, screenOut);
      const summary = flagged
        ? `Injection suspected: "${(screenOut.injection_excerpt ?? '').slice(0, 80)}" · treated as data`
        : screenOut.actionable
          ? `Actionable · ${screenOut.language} · ${screenOut.call_kind.replace('_', '-')}`
          : `Nothing actionable: ${screenOut.reason}`;
      return {
        // The flag rides the step output so a Workflow resuming after this step still has it.
        out: { ...screenOut, screenUnavailable: fallback },
        llm: meta,
        status: flagged || fallback ? 'warned' : 'passed',
        summary,
        detail: { actionable: screenOut.actionable, language: screenOut.language, injectionSuspected: flagged, injectionExcerpt: screenOut.injection_excerpt, heuristicHit: !!heuristic, modelFlag: out.injection_suspected, callKind: screenOut.call_kind, reason: screenOut.reason, fallback, fellBack: meta?.fellBack ?? false },
      };
    });
    const { screenUnavailable, ...screenOut } = screen as ScreenOutput & { screenUnavailable?: boolean };
    result.screen = screenOut;
    result.injectionFlagged = screen.injection_suspected;
    result.actionable = screen.actionable;

    // 5 ---- extract
    const skipExtract = !screen.actionable && (input.skipExtractWhenNotActionable ?? true);
    const extracted = await exec('extract', async () => {
      const spec = speculative;
      speculative = null;
      if (skipExtract) {
        // A speculative call already ran: discard its output but keep its cost on the run.
        const s = spec ? await spec : null;
        const meta = s ? (s.ok ? s.meta : s.err instanceof LlmFailure ? s.err.meta : null) : null;
        return { out: { insights: [], model: null } as ExtractionOutput & { model: string | null }, llm: meta, status: 'skipped' as StepStatus, summary: 'Skipped: nothing actionable in this conversation', detail: { count: 0, skipped: true, ...(spec ? { speculativeDiscarded: true } : {}) } };
      }
      modelInputs.push(userBlock);
      const s = spec ? await spec : await settleCall(deps.llm.structured(extractRequest()));
      if (!s.ok) {
        if (s.err instanceof LlmFailure) await deps.store.recordDlq({ runId: input.runId, step: 'extract', error: s.err.message, payload: { errors: s.err.meta.errors, attempts: s.err.meta.attempts } });
        throw s.err;
      }
      const r = s;
      const n = r.data.insights.length;
      return {
        out: { ...r.data, model: r.meta.model },
        llm: r.meta,
        status: r.meta.fellBack || r.meta.schemaRetried ? 'warned' : 'passed',
        summary: n ? `${n} candidate insight${n === 1 ? '' : 's'} (${Object.entries(countBy(r.data.insights.map((i) => i.type))).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ')})` : 'No insights: the model found nothing actionable',
        detail: {
          count: n, byType: countBy(r.data.insights.map((i) => i.type)), promptVersion: input.promptVersion, fellBack: r.meta.fellBack, schemaRetried: r.meta.schemaRetried, attempts: r.meta.attempts, errors: r.meta.errors,
          ...(spec ? { startedWithScreen: true, callMs: r.meta.ms } : {}),
        },
      };
    }) as ExtractionOutput & { model?: string | null };
    const extractModel = extracted.model ?? '';

    // 6 ---- ground
    const grounded = await exec('ground', async () => {
      const docNorm = normalize(red.text);
      const items = extracted.insights.map((ins) => ({ ins, evidence: ins.evidence.map((e) => groundQuote(e.quote, e.turn_id, red.text, red.turns, docNorm)) }));
      const all = items.flatMap((i) => i.evidence);
      const ok = all.filter((e) => e.method !== 'failed');
      const dropped = items.filter((i) => i.evidence.every((e) => e.method === 'failed')).length;
      const byMethod = countBy(all.map((e) => e.method));
      return {
        out: items,
        status: all.length > ok.length ? 'warned' : extracted.insights.length ? 'passed' : 'skipped',
        summary: all.length
          ? `${ok.length}/${all.length} quotes grounded${byMethod.fuzzy ? ` (${byMethod.fuzzy} fuzzy)` : ''}${dropped ? ` · ${dropped} insight${dropped === 1 ? '' : 's'} dropped (quote not in transcript)` : ''}`
          : 'Nothing to ground',
        detail: {
          quotes: all.length, grounded: ok.length, byMethod, droppedInsights: dropped,
          rejected: all.filter((e) => e.method === 'failed').map((e) => ({ quote: e.quote, bestScore: e.score })),
          threshold: 0.9,
        },
      };
    });

    // 7 ---- score
    const scored = await exec('score', async () => {
      const createdAt = iso(now());
      const insights: Insight[] = grounded.map(({ ins, evidence }) => {
        const s = scoreInsight({
          type: ins.type, severity: ins.severity, confidenceModel: ins.confidence, evidence, account: input.account, injectionFlagged: screen.injection_suspected, now: t0,
          ...(screenUnavailable ? { forceReview: ['the safety screen was unavailable for this file: a person reviews everything'] } : {}),
        });
        return {
          id: ids('ins'), workspaceId: input.workspaceId, runId: input.runId, accountId: input.account?.id ?? null, csmId: input.account?.csmId ?? null,
          type: ins.type, summary: ins.summary, productArea: ins.product_area, severity: ins.severity, sentiment: ins.sentiment, rationale: ins.rationale,
          evidence, confidenceModel: round(ins.confidence, 3), groundingScore: s.groundingScore, confidenceFinal: s.confidenceFinal, gate: s.gate,
          gateReasons: s.gateReasons, status: s.status, themeId: null, ownerId: null, channel: null, ruleId: null, promptVersion: input.promptVersion,
          model: extractModel, createdAt,
        };
      });
      await deps.store.saveInsights(insights);
      const g = countBy(insights.map((i) => i.gate));
      return {
        out: insights,
        status: insights.length ? 'passed' : 'skipped',
        summary: insights.length ? `${g.auto_route ?? 0} auto-route · ${g.review ?? 0} review · ${g.held ?? 0} held · ${g.dropped ?? 0} dropped` : 'Nothing to score',
        detail: { byGate: g, items: insights.map((i) => ({ id: i.id, type: i.type, model: i.confidenceModel, grounding: i.groundingScore, final: i.confidenceFinal, gate: i.gate, reasons: i.gateReasons })) },
      };
    });

    // 8 ---- theme
    const themed = await exec('theme', async () => {
      const live = scored.filter((i) => i.gate !== 'dropped');
      if (!live.length) return { out: { insights: scored, newThemes: [] as NewTheme[] }, status: 'skipped' as StepStatus, summary: 'No insights to theme' };
      let vectors: number[][];
      let embedModel: string;
      try {
        const e = await deps.embed(live.map((i) => themeText(i)));
        vectors = e.vectors;
        embedModel = e.model;
      } catch (err) {
        return { out: { insights: scored, newThemes: [] as NewTheme[] }, status: 'warned' as StepStatus, summary: `Embedding unavailable; themes not assigned (${errorMessage(err).slice(0, 80)})`, detail: { error: errorMessage(err) } };
      }
      // Nearest-neighbour lookups run in parallel (one per insight).
      const found = await Promise.all(live.map((_, i) => deps.vectorQuery(vectors[i]!, { topK: 5, workspaceId: input.workspaceId })));
      const cands = new Map<string, ThemeCandidate[]>(live.map((ins, i) => [ins.id, found[i]!]));
      const assignments = assignThemes(live.map((ins, i) => ({ key: ins.id, type: ins.type, productArea: ins.productArea, vector: vectors[i]!, summary: ins.summary })), cands);
      // Name new candidate themes (one LLM call for all of them), or hand that to the sink.
      const founders = assignments.filter((a) => a.newThemeKey === a.key);
      const names = new Map<string, { name: string; summary: string }>();
      let nameMeta: LlmMeta | null = null;
      const clusters = founders.map((f) => {
        const members = assignments.filter((a) => a.newThemeKey === f.key).map((a) => live.find((x) => x.id === a.key)!);
        return { key: f.key, type: members[0]!.type, productArea: members[0]!.productArea, summaries: members.map((m) => m.summary) };
      });
      const deferNaming = !!deps.deferThemeNaming && founders.length > 0;
      if (founders.length && !deferNaming) {
        try {
          const r = await deps.llm.structured({
            purpose: 'theme_name', system: THEME_NAME_SYSTEM, prompt: themeNamePrompt(clusters), schema: ThemeNameOutput, jsonSchema: THEME_NAME_JSON_SCHEMA as unknown as Record<string, unknown>,
            schemaName: 'themes', maxTokens: 600, runId: input.runId, repair: repairThemeNames,
          });
          nameMeta = r.meta;
          for (const t of r.data.themes) names.set(t.key, { name: t.name, summary: t.summary });
        } catch (err) {
          if (err instanceof LlmFailure) nameMeta = err.meta;
        }
      }
      const createdAt = iso(now());
      const newThemes: NewTheme[] = founders.map((f) => {
        const ins = live.find((x) => x.id === f.key)!;
        const nm = names.get(f.key);
        return {
          id: ids('thm'), workspaceId: input.workspaceId, name: nm?.name ?? fallbackThemeName(ins.summary), summary: nm?.summary ?? ins.summary,
          type: ins.type, productArea: ins.productArea, status: 'candidate', ownerId: null, vector: vectors[live.indexOf(ins)]!, createdAt,
        };
      });
      const themeIdFor = (a: (typeof assignments)[number]) => a.themeId ?? newThemes[founders.findIndex((f) => f.key === a.newThemeKey)]?.id ?? null;
      const updated = scored.map((ins) => {
        const a = assignments.find((x) => x.key === ins.id);
        return a ? { ...ins, themeId: themeIdFor(a) } : ins;
      });
      if (newThemes.length) await deps.store.createThemes(newThemes);
      await deps.store.saveInsights(updated.filter((i) => i.themeId));
      if (deferNaming) deps.deferThemeNaming!({ runId: input.runId, clusters: clusters.map((c, i) => ({ ...c, themeId: newThemes[i]!.id, vector: newThemes[i]!.vector, workspaceId: input.workspaceId })) });
      const joined = assignments.filter((a) => a.themeId).length;
      return {
        out: { insights: updated, newThemes },
        llm: nameMeta,
        summary: `${joined ? `Joined ${new Set(assignments.filter((a) => a.themeId).map((a) => a.themeId)).size} existing theme${joined === 1 ? '' : 's'}` : 'No existing theme matched'}${newThemes.length ? ` · started ${newThemes.length} candidate theme${newThemes.length === 1 ? '' : 's'}` : ''}`,
        detail: {
          embedModel,
          ...(deferNaming ? { namingDeferred: true } : {}),
          assignments: assignments.map((a) => ({ insightId: a.key, themeId: themeIdFor(a), name: a.matchedName ?? newThemes.find((t) => t.id === themeIdFor(a))?.name ?? null, score: round(a.score, 3), created: a.newThemeKey === a.key })),
        },
      };
    });
    result.newThemes = themed.newThemes;

    // 9 ---- route
    const routed = await exec('route', async () => {
      const decisions = new Map<string, RouteDecision>();
      const updated = themed.insights.map((ins) => {
        if (ins.gate === 'dropped') return ins;
        const d = routeInsight({ type: ins.type, productArea: ins.productArea, severity: ins.severity, arrBand: input.account?.arrBand ?? null }, input.rules, input.people);
        decisions.set(ins.id, d);
        return { ...ins, ownerId: d.ownerId, channel: d.channel, ruleId: d.ruleId };
      });
      await deps.store.saveInsights(updated.filter((i) => i.gate !== 'dropped'));
      const auto = updated.filter((i) => i.gate === 'auto_route').length;
      const review = updated.filter((i) => i.gate === 'review').length;
      const triage = [...decisions.values()].filter((d) => d.channel === 'triage').length;
      const owner = (id: string) => input.people.find((p) => p.id === id)?.name ?? id;
      return {
        out: { insights: updated, decisions: [...decisions.entries()] },
        status: decisions.size ? 'passed' : 'skipped',
        summary: decisions.size
          ? `${auto} ready to deliver${review ? ` · ${review} awaiting review` : ''}${triage ? ` · ${triage} to triage` : ''}`
          : 'Nothing to route',
        detail: { decisions: [...decisions.entries()].map(([insightId, d]) => ({ insightId, ...d, ownerName: owner(d.ownerId), gate: updated.find((i) => i.id === insightId)?.gate })) },
      };
    });

    // 10 ---- deliver
    const delivered = await exec('deliver', async () => {
      const decisions = new Map(routed.decisions);
      const deliveries: Delivery[] = [];
      const notifications: Notification[] = [];
      for (const ins of routed.insights) {
        if (ins.gate !== 'auto_route') continue;
        const d = decisions.get(ins.id);
        if (!d) continue;
        const ctx = { account: input.account, owner: input.people.find((p) => p.id === d.ownerId) ?? null, csm: input.people.find((p) => p.id === ins.csmId) ?? null, now: now(), ids };
        const dl = deliverInsight(ins, d, ctx);
        deliveries.push(dl);
        deps.telemetry?.delivery?.(dl);
        const n = routedNotification(ins, dl, ctx);
        if (n) notifications.push(n);
      }
      if (deliveries.length) await deps.store.saveDeliveries(deliveries);
      if (notifications.length) await deps.store.saveNotifications(notifications);
      const retries = deliveries.filter((d) => d.attempts.length > 1).length;
      const pending = routed.insights.filter((i) => i.gate === 'review').length;
      return {
        out: { deliveries, notifications },
        status: deliveries.length ? 'passed' : 'skipped',
        summary: deliveries.length
          ? `Delivered ${deliveries.length} (${deliveries.map((d) => `${channelLabel(d.channel)} ${d.receipt}`).join(', ')})${retries ? ` · ${retries} retried` : ''}`
          : pending ? `Nothing auto-delivered · ${pending} waiting for a reviewer` : 'Nothing to deliver',
        detail: { deliveries: deliveries.map((d) => ({ id: d.id, insightId: d.insightId, channel: d.channel, destination: d.destination, receipt: d.receipt, attempts: d.attempts.length })), retries, notified: notifications.length, awaitingReview: pending },
      };
    });

    result.insights = routed.insights;
    result.deliveries = delivered.deliveries;
    result.notifications = delivered.notifications;
    result.costUsd = round(steps.reduce((s, r) => s + (r.costUsd ?? 0), 0), 6);
    result.status = result.insights.some((i) => i.status === 'pending_review') ? 'awaiting_review' : 'completed';
  } catch (err) {
    result.status = 'failed';
    result.error = errorMessage(err);
    result.costUsd = round(steps.reduce((s, r) => s + (r.costUsd ?? 0), 0), 6);
  }
  result.durationMs = steps.reduce((s, r) => s + (r.durationMs ?? 0), 0);
  return result;
}

/** Final run-row patch from a pipeline result. */
export function runPatch(r: PipelineResult, finishedAt: string): Record<string, unknown> {
  return {
    status: r.status,
    finishedAt,
    durationMs: r.durationMs,
    costUsd: r.costUsd,
    insightCount: r.insights.filter((i) => i.gate !== 'dropped').length,
    droppedCount: r.insights.filter((i) => i.gate === 'dropped').length,
    reviewCount: r.insights.filter((i) => i.status === 'pending_review').length,
    injectionFlagged: r.injectionFlagged,
    actionable: r.actionable,
    error: r.error,
  };
}

function channelLabel(c: string): string {
  return { slack: 'Slack', jira: 'Jira', linear: 'Linear', email_digest: 'Digest', triage: 'Triage' }[c] ?? c;
}

function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export { TYPE_LABEL };
export type { Evidence, Turn };
