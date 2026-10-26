/**
 * MCP tools. Each one calls the same JSON API the product uses (internally, as the token's
 * workspace), so validation, budgets, rate limits and audit rows all apply unchanged.
 */
import type { Delivery, Insight, Person, RunDetail, Run, StepKey } from '../../shared/contracts.ts';
import { ANALYSES, CONNECTORS, REPO_URL } from '../../shared/platform.ts';
import { DOCS, docByName } from './docs.ts';

export type Call = <T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) => Promise<T>;

export class ToolError extends Error {}

type JsonSchema = Record<string, unknown>;
export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: boolean };
  run: (args: Record<string, unknown>, call: Call) => Promise<unknown>;
};

const STEP_NAME: Record<StepKey, string> = {
  ingest: 'Ingest', normalize: 'Read', redact: 'Remove PII', screen: 'Triage (decision model)', extract: 'Extract (main model)',
  ground: 'Check quotes (code)', score: 'Score and second opinion', theme: 'Theme', route: 'Route (rules)', deliver: 'Deliver (simulated tools)',
};

const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: 'string', description, ...extra });
const qs = (p: Record<string, unknown>) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : '';
};
const read = { readOnlyHint: true, openWorldHint: false } as const;

function insightView(i: Insight, people: Map<string, string>) {
  return {
    id: i.id, type: i.type, summary: i.summary, productArea: i.productArea, severity: i.severity, status: i.status,
    gate: i.gate, why: i.gateReasons, score: i.confidenceFinal, modelConfidence: i.confidenceModel, quoteMatch: i.groundingScore,
    quotes: i.evidence.map((e) => ({ text: e.matchedText ?? e.quote, check: e.method })),
    secondOpinion: i.secondOpinion ?? null,
    owner: i.ownerId ? people.get(i.ownerId) ?? i.ownerId : null, channel: i.channel, themeId: i.themeId, runId: i.runId, accountId: i.accountId,
  };
}

function deliveryView(d: Delivery, people: Map<string, string>) {
  return {
    id: d.id, insightId: d.insightId, channel: d.channel, destination: d.destination, owner: people.get(d.ownerId) ?? d.ownerId,
    status: d.status, receipt: d.receipt, ticketState: d.ticketState, tagged: d.mentions?.map((m) => `${m.handle} (${m.role})`) ?? [],
    via: d.connectorAccount ?? null, simulated: true, attempts: d.attempts.length,
  };
}

async function peopleIndex(call: Call): Promise<Map<string, string>> {
  const w = await call<{ people: Person[] }>('GET', '/world');
  return new Map(w.people.map((p) => [p.id, p.name]));
}

function runView(d: RunDetail, people: Map<string, string>, transcript: boolean) {
  const r = d.run;
  return {
    run: { id: r.id, file: r.filename, status: r.status, mode: r.mode, modeReason: r.modeReason, source: r.source ?? null, docKind: r.docKind ?? null, account: r.accountId, startedAt: r.createdAt, tookMs: r.durationMs, aiCostUsd: r.costUsd, promptVersion: r.promptVersion },
    triage: d.screen,
    steps: d.steps.map((s) => ({ step: STEP_NAME[s.key], status: s.status, ms: s.durationMs, startedAt: s.startedAt, model: s.model, tokensIn: s.tokensIn, tokensOut: s.tokensOut, costUsd: s.costUsd, summary: s.summary })),
    insights: d.insights.map((i) => insightView(i, people)),
    deliveries: d.deliveries.map((x) => deliveryView(x, people)),
    redactions: d.redactions.map((x) => ({ token: x.token, kind: x.kind, count: x.count })),
    ...(transcript ? { transcript: d.turns.slice(0, 400).map((t) => `${t.speaker}${t.ts ? ` [${t.ts}]` : ''}: ${t.text}`) } : {}),
  };
}

const ABOUT = `Switchboard, built from scratch in 48 hours for Invoca's AI Operations Lead take-home (Option 3, the feedback loop).

What it is: a platform that reads any customer conversation or document, decides what it is with a fast decision model, runs the analyses that apply, and sends results to the right people in their tools. Signal Loop is the one analysis built: it extracts product feedback (feature requests, bugs, pricing objections, competitor mentions, churn risk, praise) with the customer's verbatim words, checks every quote against the transcript in code, scores each insight (with an independent second opinion), groups insights into themes with ARR attached, routes them by an editable rules table, and tells the CSM when their feedback ships. Agent Ops is the sibling product that operates every agent (owners, logs, traces, cost, SLOs).

Real in this demo: all of the AI and the pipeline (triage, extraction, quote checks, scoring, second opinion, themes, routing, review, evals and the promotion gate, the budget cap and replay, Agent Ops telemetry for Signal Loop); inputs (upload any file, paste, the library); outputs (each delivery's content, who is tagged, receipts).
Simulated: every connector (${CONNECTORS.map((c) => c.name).join(', ')}): nothing is sent to a real tool. The accounts, people and calls are fictional. Agent Ops' RFP Responder agent and the six weeks of history are simulated. Not built: ${ANALYSES.filter((a) => a.availability !== 'built').map((a) => a.name).join(', ')}.

Your access: this token's private workspace plus the shared sample history. Processing a conversation or reviewing an insight changes only this workspace. Live AI runs draw on a capped demo budget.

Docs (read_doc): ${DOCS.map((d) => d.name).join(', ')}. The walkthrough doc is the best place to start.

Source code: ${REPO_URL} (README, AGENTS.md, docs/ and .claude/skills/ for adding connectors, people, SSO and analyses).`;

export const TOOLS: Tool[] = [
  {
    name: 'about', title: 'About this project', annotations: read,
    description: 'Start here. What Switchboard and Signal Loop are, what is real and what is simulated, and how to explore. Returns plain text.',
    inputSchema: obj({}),
    run: async () => ABOUT,
  },
  {
    name: 'read_doc', title: 'Read a project doc', annotations: read,
    description: `Full Markdown of a project document: ${DOCS.map((d) => `${d.name} (${d.description})`).join('; ')}`,
    inputSchema: obj({ name: str('Which document', { enum: DOCS.map((d) => d.name) }) }, ['name']),
    run: async (a) => {
      const d = docByName(String(a.name));
      if (!d) throw new ToolError(`No doc named "${String(a.name)}". Try: ${DOCS.map((x) => x.name).join(', ')}`);
      return d.text;
    },
  },
  {
    name: 'get_session', title: 'Session and models', annotations: read,
    description: 'The workspace, the three model roles (decision, main, backup) with their ids, the live AI budget, the prompt version and who you are acting as.',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/session'),
  },
  {
    name: 'platform_overview', title: 'Platform overview', annotations: read,
    description: 'What came in (by kind and source), deliveries by tool, people tagged, items waiting for review and median time to owner, over a window of days.',
    inputSchema: obj({ days: { type: 'integer', minimum: 1, maximum: 365, description: 'Window in days (default 30)' } }),
    run: (a, call) => call('GET', `/overview${qs({ days: a.days ?? 30 })}`),
  },
  {
    name: 'list_library_files', title: 'Sample library', annotations: read,
    description: 'The 48 sample files you can process by id: calls, notes, email threads and chat exports, from clean to messy, plus edge cases (injection, PHI, nothing actionable).',
    inputSchema: obj({}),
    run: async (_a, call) => {
      const files = await call<{ id: string; filename: string; accountId: string | null; callType: string; messLevel: number | null; edgeKind: string | null; format: string }[]>('GET', '/library');
      return files.map((f) => ({ id: f.id, file: f.filename, format: f.format, account: f.accountId, callType: f.callType, messLevel: f.messLevel, edgeCase: f.edgeKind }));
    },
  },
  {
    name: 'process_conversation', title: 'Process a conversation',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description:
      'Run a conversation through the real pipeline (triage, extraction, quote checks, scoring, themes, routing, simulated delivery) and wait for the result. Give either `text` (a transcript, notes or email, 40 to 200,000 characters) or `fileId` from list_library_files. Uses the live AI budget; replays a recorded run if live AI is off.',
    inputSchema: obj({
      text: str('Conversation text to analyse'),
      filename: str('A file name for it, e.g. "acme-qbr-notes.md"'),
      fileId: str('A sample library file id instead of text'),
    }),
    run: async (a, call) => {
      const body = typeof a.fileId === 'string' && a.fileId ? { fileId: a.fileId, rerun: true } : typeof a.text === 'string' ? { text: a.text, filename: typeof a.filename === 'string' && a.filename ? a.filename : 'claude-upload.txt', source: 'paste' } : null;
      if (!body) throw new ToolError('Give `text` or `fileId`.');
      const created = await call<{ runId: string; mode: string; duplicate?: boolean }>('POST', '/runs', body);
      const t0 = Date.now();
      let d = await call<RunDetail>('GET', `/runs/${created.runId}`);
      while ((d.run.status === 'queued' || d.run.status === 'running') && Date.now() - t0 < 45_000) {
        await new Promise((r) => setTimeout(r, 700));
        d = await call<RunDetail>('GET', `/runs/${created.runId}`);
      }
      return { ...runView(d, await peopleIndex(call), false), waitedMs: Date.now() - t0, duplicate: created.duplicate ?? false };
    },
  },
  {
    name: 'list_conversations', title: 'Conversations', annotations: read,
    description: 'Recent conversations (runs) in this workspace and the sample history: file, status, source, kind, insight counts, time and AI cost.',
    inputSchema: obj({ limit: { type: 'integer', minimum: 1, maximum: 100, description: 'How many (default 25)' } }),
    run: async (a, call) => {
      const runs = await call<Run[]>('GET', `/runs${qs({ limit: a.limit ?? 25 })}`);
      return runs.map((r) => ({ id: r.id, file: r.filename, status: r.status, mode: r.mode, source: r.source ?? null, kind: r.docKind ?? null, insights: r.insightCount, toReview: r.reviewCount, droppedQuotes: r.droppedCount, tookMs: r.durationMs, aiCostUsd: r.costUsd, at: r.createdAt }));
    },
  },
  {
    name: 'get_conversation', title: 'One conversation', annotations: read,
    description: 'Everything about one run: triage verdicts, each step with model, tokens, cost and timing, the insights with quotes and gate reasons, deliveries and who was tagged. Set includeTranscript for the redacted transcript.',
    inputSchema: obj({ runId: str('Run id, e.g. run_…'), includeTranscript: { type: 'boolean', description: 'Include the redacted transcript (default false)' } }, ['runId']),
    run: async (a, call) => runView(await call<RunDetail>('GET', `/runs/${encodeURIComponent(String(a.runId))}`), await peopleIndex(call), a.includeTranscript === true),
  },
  {
    name: 'list_insights', title: 'Insights', annotations: read,
    description: 'Insights across conversations, filterable by type, product area, status, account or text.',
    inputSchema: obj({
      type: str('feature_request | bug | pricing_objection | competitor_mention | churn_risk | praise'),
      area: str('call_tracking | signal_ai | presense | integrations | quality_management | ai_agents | billing_pricing | platform'),
      status: str('pending_review | routed | rejected | held | dropped_ungrounded'),
      account: str('Account id'),
      q: str('Text search'),
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 50' },
    }),
    run: async (a, call) => {
      const [list, people] = await Promise.all([call<Insight[]>('GET', `/insights${qs({ type: a.type, area: a.area, status: a.status, account: a.account, q: a.q })}`), peopleIndex(call)]);
      return list.slice(0, Number(a.limit ?? 50)).map((i) => insightView(i, people));
    },
  },
  {
    name: 'review_queue', title: 'Review queue', annotations: read,
    description: 'Insights waiting for a person, with why each one is there (score band, churn risk, critical bug, flagged file) and the second opinion when present.',
    inputSchema: obj({}),
    run: async (_a, call) => {
      const [list, people] = await Promise.all([call<Insight[]>('GET', '/review'), peopleIndex(call)]);
      return list.map((i) => insightView(i, people));
    },
  },
  {
    name: 'review_insight', title: 'Review an insight',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: 'Approve, edit or reject an insight waiting for review, as the acting user. Approving routes it by the rules and creates its (simulated) delivery. Edits are saved as labelled data.',
    inputSchema: obj(
      {
        insightId: str('Insight id from review_queue'),
        action: str('approve | edit | reject', { enum: ['approve', 'edit', 'reject'] }),
        edits: obj({ type: str('New type'), summary: str('New summary'), productArea: str('New product area'), severity: str('low | medium | high | critical') }),
        reason: str('Why (optional, up to 300 characters)'),
      },
      ['insightId', 'action'],
    ),
    run: (a, call) =>
      call('POST', `/review/${encodeURIComponent(String(a.insightId))}`, {
        idempotencyKey: crypto.randomUUID(),
        action: a.action,
        ...(a.action === 'edit' && a.edits ? { edits: a.edits } : {}),
        ...(typeof a.reason === 'string' && a.reason ? { reason: a.reason } : {}),
      }),
  },
  {
    name: 'list_themes', title: 'Themes', annotations: read,
    description: 'Patterns across accounts: each theme with insight and account counts, ARR at stake, an 8-week trend, status and representative quotes. Pass themeId for one theme with its insights and accounts.',
    inputSchema: obj({ themeId: str('Optional: one theme id') }),
    run: (a, call) => (typeof a.themeId === 'string' && a.themeId ? call('GET', `/themes/${encodeURIComponent(a.themeId)}`) : call('GET', '/themes')),
  },
  {
    name: 'routing_rules', title: 'Routing rules', annotations: read,
    description: 'The editable rules table that decides owner and channel (type, product area, severity, ARR band). The model never picks the owner. A rule whose tool is disconnected routes to triage.',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/routing/rules'),
  },
  {
    name: 'list_deliveries', title: 'Deliveries', annotations: read,
    description: 'What was sent where (all simulated): channel, destination, owner, who was tagged, receipt and ticket state.',
    inputSchema: obj({ channel: str('slack | teams | jira | linear | salesforce | email | email_digest | google_drive | triage'), limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 50' } }),
    run: async (a, call) => {
      const [list, people] = await Promise.all([call<Delivery[]>('GET', `/deliveries${qs({ channel: a.channel })}`), peopleIndex(call)]);
      return list.slice(0, Number(a.limit ?? 50)).map((d) => deliveryView(d, people));
    },
  },
  {
    name: 'quality_report', title: 'Quality (evals)', annotations: read,
    description: 'Eval results on hand-labelled files: precision and recall overall, by type and by mess level, safety checks, the candidate prompt and why the promotion gate blocked it.',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/evals'),
  },
  {
    name: 'usage_and_budget', title: 'Usage and budget', annotations: read,
    description: 'The live AI budget (spent of the cap, live vs replay runs), the daily ledger and any failures.',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/health'),
  },
  {
    name: 'list_connections', title: 'Connections (simulated)', annotations: read,
    description: 'Every connector and its state in this workspace. Connectors are simulated: connecting records a connection and deliveries render as previews; nothing is sent to the real tool.',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/connections'),
  },
  {
    name: 'list_people', title: 'People', annotations: read,
    description: 'The directory Switchboard tags: role, title, product area and handles per tool (fictional people).',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/people'),
  },
  {
    name: 'list_analyses', title: 'Analyses', annotations: read,
    description: 'The analyses catalog: Signal Loop is built and runs; the others are listed and not built.',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/analyses'),
  },
  {
    name: 'agent_ops_overview', title: 'Agent Ops overview', annotations: read,
    description: 'The executive view across agents: hours saved, estimated value, AI cost, adoption. Signal Loop is live; the RFP Responder agent and the six-week history are simulated.',
    inputSchema: obj({}),
    run: (_a, call) => call('GET', '/platform/overview'),
  },
  {
    name: 'agent_ops_trace', title: 'Trace of a run', annotations: read,
    description: 'The span waterfall for one run in Agent Ops: every step, model call and delivery attempt with timings.',
    inputSchema: obj({ runId: str('Run id (the trace id is the run id)') }, ['runId']),
    run: (a, call) => call('GET', `/platform/traces/${encodeURIComponent(String(a.runId))}`),
  },
];

export const toolByName = (name: string): Tool | undefined => TOOLS.find((t) => t.name === name);
export { ABOUT };
