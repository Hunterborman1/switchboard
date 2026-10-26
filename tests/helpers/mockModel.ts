/**
 * A deterministic stand-in for the extraction/screen/theme models. It reads the rendered
 * transcript lines ("[t003] Speaker (role): text") and emits verbatim quotes for keyword
 * rules, so the real grounding, scoring, routing and delivery code runs on realistic output.
 * Magic words: HALLUCINATE (emit a fabricated quote), FORCE_LLM_ERROR (HTTP 500),
 * FORCE_BAD_JSON (invalid output on the first attempt), SLOW_MODEL (sleep), DECISION_DOWN (the
 * decision model answers 503), SECOND_OPINION_AGREE / SECOND_OPINION_DISAGREE (in a quote: the
 * second opinion agrees at 0.93 / disagrees at 0.9; otherwise it agrees at 0.8, which moves nothing).
 */
import type { ExtractionOutput, ScreenOutput } from '../../src/shared/contracts.ts';

type Rule = { re: RegExp; type: ExtractionOutput['insights'][number]['type']; area: ExtractionOutput['insights'][number]['product_area']; severity: 'low' | 'medium' | 'high' | 'critical'; sentiment: 'negative' | 'mixed' | 'neutral' | 'positive'; summary: string; confidence: number };

const RULES: Rule[] = [
  { re: /offline conversions/i, type: 'bug', area: 'integrations', severity: 'medium', sentiment: 'negative', summary: 'Offline conversions reach Google Ads days late and break bidding', confidence: 0.92 },
  { re: /call ?rail/i, type: 'competitor_mention', area: 'integrations', severity: 'medium', sentiment: 'negative', summary: 'CallRail is pitching same-day conversion sync', confidence: 0.7 },
  { re: /tagging[^.]*spam/i, type: 'bug', area: 'signal_ai', severity: 'medium', sentiment: 'negative', summary: 'Signal AI tags real after-hours callers as spam', confidence: 0.9 },
  { re: /paying twice/i, type: 'pricing_objection', area: 'billing_pricing', severity: 'medium', sentiment: 'negative', summary: 'Finance objects to PreSense being priced as an add-on', confidence: 0.88 },
  { re: /great actually|love them/i, type: 'praise', area: 'signal_ai', severity: 'low', sentiment: 'positive', summary: 'Dispatchers love the new call summaries', confidence: 0.95 },
  { re: /not renew|won't renew/i, type: 'churn_risk', area: 'platform', severity: 'critical', sentiment: 'negative', summary: 'Account threatens non-renewal over redaction gaps', confidence: 0.9 },
  { re: /export the call dashboard/i, type: 'feature_request', area: 'platform', severity: 'medium', sentiment: 'negative', summary: 'Dashboard CSV export times out beyond 30 days', confidence: 0.85 },
  { re: /presense data just vanishes/i, type: 'bug', area: 'presense', severity: 'high', sentiment: 'negative', summary: 'PreSense data lost on Genesys transfers', confidence: 0.9 },
];

export function transcriptLines(user: string): { id: string; text: string }[] {
  const m = user.match(/<transcript>\n([\s\S]*?)\n<\/transcript>/);
  const body = m ? m[1]! : user;
  return body.split('\n').map((l) => {
    const x = l.match(/^\[(t\d{3})\][^:]*:\s(.*)$/);
    return x ? { id: x[1]!, text: x[2]! } : null;
  }).filter((x): x is { id: string; text: string } => !!x);
}

function sentenceWith(text: string, re: RegExp): string {
  const parts = text.split(/(?<=[.!?])\s+/);
  const hit = parts.find((p) => re.test(p)) ?? text;
  const words = hit.split(/\s+/);
  return words.slice(0, 28).join(' ');
}

export function mockScreen(user: string): ScreenOutput {
  const lines = transcriptLines(user);
  const all = lines.map((l) => l.text).join(' ');
  const injection = /ignore (all )?previous instructions/i.test(all);
  const actionable = RULES.some((r) => r.re.test(all)) || /HALLUCINATE/.test(all);
  return {
    actionable,
    language: /\b(el|los|las|que|pero|llamadas)\b/i.test(all) && !/\bthe\b/i.test(all) ? 'es' : 'en',
    injection_suspected: injection,
    injection_excerpt: injection ? 'ignore all previous instructions' : null,
    call_kind: 'check_in',
    reason: actionable ? 'Customer raised product feedback' : 'Pleasantries and scheduling only',
    doc_kind: 'call_transcript',
    complexity: 'clean',
    analyses: actionable ? ['product_feedback', 'follow_ups'] : ['follow_ups'],
  };
}

export function mockSecondOpinion(user: string): { verdicts: { key: string; agree: boolean; confidence: number; note: string }[] } {
  const verdicts: { key: string; agree: boolean; confidence: number; note: string }[] = [];
  for (const m of user.matchAll(/<item key="([^"]+)">\n([\s\S]*?)\n<\/item>/g)) {
    const body = m[2]!;
    if (/SECOND_OPINION_DISAGREE/.test(body)) verdicts.push({ key: m[1]!, agree: false, confidence: 0.9, note: 'The quote does not say this' });
    else if (/SECOND_OPINION_AGREE/.test(body)) verdicts.push({ key: m[1]!, agree: true, confidence: 0.93, note: 'The quote says exactly this' });
    else verdicts.push({ key: m[1]!, agree: true, confidence: 0.8, note: 'The quote supports it' });
  }
  return { verdicts };
}

export function mockExtract(user: string): ExtractionOutput {
  const lines = transcriptLines(user);
  const out: ExtractionOutput['insights'] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    const line = lines.find((l) => rule.re.test(l.text));
    if (!line || seen.has(rule.summary)) continue;
    seen.add(rule.summary);
    out.push({
      type: rule.type, summary: rule.summary, product_area: rule.area, severity: rule.severity, sentiment: rule.sentiment,
      evidence: [{ quote: sentenceWith(line.text, rule.re), turn_id: line.id }], confidence: rule.confidence, rationale: 'Mock model: keyword rule matched a customer statement.',
    });
  }
  if (lines.some((l) => /HALLUCINATE/.test(l.text))) {
    out.push({
      type: 'feature_request', summary: 'Customer wants a native Snowflake connector', product_area: 'integrations', severity: 'low', sentiment: 'neutral',
      evidence: [{ quote: 'we really need a native snowflake connector for the warehouse team', turn_id: 't001' }], confidence: 0.8, rationale: 'Fabricated quote for tests.',
    });
  }
  return { insights: out };
}

export function mockThemeNames(user: string): { themes: { key: string; name: string; summary: string }[] } {
  const out: { key: string; name: string; summary: string }[] = [];
  for (const m of user.matchAll(/<cluster key="([^"]+)"[^>]*>\n- ([^\n]+)/g)) {
    out.push({ key: m[1]!, name: m[2]!.split(' ').slice(0, 6).join(' '), summary: m[2]! });
  }
  return { themes: out };
}

/** Respond by schema name (screen | insights | themes | second_opinion). */
export function mockRespond(schemaName: string, user: string): unknown {
  if (schemaName === 'screen') return mockScreen(user);
  if (schemaName === 'second_opinion') return mockSecondOpinion(user);
  if (schemaName === 'insights') return mockExtract(user);
  if (schemaName === 'themes') return mockThemeNames(user);
  return {};
}
