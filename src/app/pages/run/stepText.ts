/**
 * Plain-English words for the ten pipeline steps on the conversation page: the step names a
 * VP of Customer Success reads, what each step does, and a one-sentence account of what it did
 * on this run (built from the step's recorded detail, falling back to its own summary).
 */
import type { Insight, RunStep, ScreenOutput, StepKey } from '../../../shared/contracts';
import { plainSummary } from './modelName';

export const STEP_NAME: Record<StepKey, string> = {
  ingest: 'Ingest',
  normalize: 'Read',
  redact: 'Remove PII',
  screen: 'Triage',
  extract: 'Extract',
  ground: 'Check quotes',
  score: 'Score',
  theme: 'Theme',
  route: 'Route',
  deliver: 'Deliver',
};

export const STEP_ABOUT: Record<StepKey, string> = {
  ingest: 'Saves the original file. The same file sent twice is recognised and not processed again.',
  normalize: 'Works out the format and splits the conversation into speakers and lines.',
  redact: 'Replaces names, contact details and health information with placeholders. Only the redacted text reaches AI.',
  screen: 'The fast decision model works out what this is, whether it holds product feedback, and whether anything is trying to steer the AI.',
  extract: 'The main model pulls out each insight with its type, product area, severity and the customer’s exact words.',
  ground: 'Code checks that every quote really appears in the conversation. An insight whose quote can’t be found is dropped.',
  score: 'Combines the AI’s confidence and the quote check into one score: send automatically, ask a person, or hold.',
  theme: 'Groups each insight with similar feedback from other customers, or starts a new theme.',
  route: 'Your routing rules pick the owner and the tool by type, product area, severity and account size.',
  deliver: 'Sends each insight to its owner and keeps a receipt. Deliveries here are in-app previews, so they are instant.',
};

const PII_WORD: Record<string, [string, string]> = {
  person: ['name', 'names'],
  phone: ['phone number', 'phone numbers'],
  email: ['email address', 'email addresses'],
  card: ['card number', 'card numbers'],
  ssn: ['social security number', 'social security numbers'],
  dob: ['date of birth', 'dates of birth'],
  patient: ['patient name', 'patient names'],
  mrn: ['medical record number', 'medical record numbers'],
  address: ['address', 'addresses'],
};

export const piiWord = (kind: string, n: number) => {
  const w = PII_WORD[kind] ?? ['personal detail', 'personal details'];
  return `${n} ${n === 1 ? w[0] : w[1]}`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const TYPE_WORD: Record<string, [string, string]> = {
  feature_request: ['feature request', 'feature requests'],
  bug: ['bug', 'bugs'],
  pricing_objection: ['pricing objection', 'pricing objections'],
  competitor_mention: ['competitor mention', 'competitor mentions'],
  churn_risk: ['churn risk', 'churn risks'],
  praise: ['piece of praise', 'pieces of praise'],
};

export function languageName(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Server summaries are terse ("7/7 quotes grounded · 0 dropped"); make them read as a sentence. */
export function tidySummary(text: string | null | undefined, rewrite: (s: string) => string): string | null {
  if (!text) return null;
  const s = plainSummary(rewrite(text))!
    .replace(/^failed:\s*/i, '')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\bsha256\s+[0-9a-f…]+/gi, '')
    .replace(/,\s*$/, '')
    .trim();
  if (!s) return null;
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?…]$/.test(s) ? '' : '.'}`;
}

/** One sentence: what this step did on this run. Null when the step hasn't finished. */
export function stepStory(step: RunStep, ctx: { screen: ScreenOutput | null; insights: Insight[]; rewrite: (s: string) => string }): string | null {
  const d = rec(step.detail);
  if (step.status === 'pending' || step.status === 'running') return null;
  if (step.status === 'failed') return tidySummary(step.summary, ctx.rewrite) ?? 'This step failed after retrying.';
  switch (step.key) {
    case 'ingest': {
      if (typeof d.duplicateOf === 'string' && d.duplicateOf) return 'Identical to an earlier upload, so nothing was processed again.';
      const size = num(d.sizeBytes);
      return size != null ? `Saved the original file (${size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`}).` : 'Saved the original file.';
    }
    case 'normalize': {
      const turns = num(d.turns);
      const speakers = num(d.speakers);
      if (turns != null) return `Read ${plural(turns, 'line')}${speakers ? ` from ${plural(speakers, 'speaker')}` : ''}.`;
      break;
    }
    case 'redact': {
      const total = num(d.total);
      if (total === 0) return 'Found no personal details to hide.';
      const by = rec(d.byKind);
      const parts = Object.entries(by)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([k, v]) => piiWord(k, v as number));
      if (total != null) return `Hid ${plural(total, 'personal detail')}${parts.length ? `: ${parts.join(', ')}` : ''}.`;
      break;
    }
    case 'screen': {
      const s = ctx.screen;
      if (!s) break;
      // Recorded triage says what the input is; older runs only have the screen's verdicts.
      const kindLabel = typeof d.docKindLabel === 'string' ? d.docKindLabel : null;
      const kind = kindLabel ? kindLabel.toLowerCase() : null;
      const article = kind && /^[aeiou]/.test(kind) ? 'An' : 'A';
      if (s.injection_suspected) return 'Found hidden instructions aimed at the AI and treated them as plain text.';
      if (!s.actionable) return kind ? `${article} ${kind} with no product feedback, so there is nothing to extract.` : 'No product feedback in this one, so there is nothing to extract.';
      return kind ? `${article} ${kind} in ${languageName(s.language)}, with product feedback.` : `Product feedback found, in ${languageName(s.language)}.`;
    }
    case 'extract': {
      if (step.status === 'skipped') return 'Skipped: nothing to extract.';
      const count = num(d.count);
      const chunks = num(d.chunks);
      const split = chunks != null && chunks > 1 ? ` Read in ${chunks} parts in parallel.` : '';
      if (count === 0) return `Found no product feedback.${split}`;
      const by = rec(d.byType);
      const parts = Object.entries(by)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([k, v]) => {
          const w = TYPE_WORD[k] ?? [k.replace(/_/g, ' '), k.replace(/_/g, ' ')];
          return `${v} ${v === 1 ? w[0] : w[1]}`;
        });
      const extra = d.fellBack ? ' The backup model answered.' : d.schemaRetried ? ' One retry fixed the answer’s format.' : '';
      if (count != null) return `Found ${plural(count, 'possible insight')}${parts.length ? `: ${parts.join(', ')}` : ''}.${split}${extra}`;
      break;
    }
    case 'ground': {
      if (step.status === 'skipped') return 'Skipped: no quotes to check.';
      const evidence = ctx.insights.flatMap((i) => i.evidence);
      const total = num(d.quotes) ?? (evidence.length || null);
      const failed = evidence.filter((e) => e.method === 'failed').length;
      const grounded = num(d.grounded) ?? (total != null ? total - failed : null);
      const droppedInsights = num(d.droppedInsights) ?? (Array.isArray(d.dropped) ? d.dropped.length : ctx.insights.filter((i) => i.gate === 'dropped').length);
      if (total == null || grounded == null) break;
      if (total === 0) return 'No quotes to check.';
      if (droppedInsights > 0)
        return `${grounded} of ${total} quotes were found in the conversation. ${droppedInsights === 1 ? 'One insight was' : `${droppedInsights} insights were`} dropped because ${droppedInsights === 1 ? 'its quote wasn’t' : 'their quotes weren’t'}.`;
      return `All ${plural(total, 'quote')} ${total === 1 ? 'was' : 'were'} found in the conversation.`;
    }
    case 'score': {
      const by = rec(d.byGate);
      const auto = num(by.auto_route) ?? 0;
      const review = num(by.review) ?? 0;
      const held = num(by.held) ?? 0;
      if (auto + review + held === 0) return step.status === 'skipped' ? 'Skipped: nothing to score.' : 'Nothing to score.';
      const parts = [auto ? `${auto} confident enough to send automatically` : null, review ? `${review} for a person to check` : null, held ? `${held} held` : null].filter(Boolean);
      const checked = ctx.insights.filter((i) => i.secondOpinion);
      const agreed = checked.filter((i) => i.secondOpinion!.agree).length;
      const opinion = checked.length ? ` The decision model took a second look and agreed with ${agreed} of ${checked.length}.` : '';
      return `${parts.join(', ')}.${opinion}`.replace(/^./, (c) => c.toUpperCase());
    }
    case 'route': {
      const decisions = Array.isArray(d.decisions) ? d.decisions.length : null;
      if (decisions === 0 || step.status === 'skipped') return 'Skipped: nothing to route.';
      if (decisions != null) return `Picked an owner for ${plural(decisions, 'insight')}.`;
      break;
    }
    case 'deliver': {
      const deliveries = Array.isArray(d.deliveries) ? d.deliveries.length : null;
      const retries = num(d.retries) ?? 0;
      const reviewing = ctx.insights.filter((i) => i.gate === 'review').length;
      if (deliveries === 0 || step.status === 'skipped')
        return reviewing
          ? `Nothing was sent automatically. ${reviewing === 1 ? 'The insight waiting for review is' : `The ${reviewing} insights waiting for review are`} sent once approved.`
          : 'Skipped: nothing to deliver.';
      if (deliveries != null) return `Delivered ${plural(deliveries, 'insight')} with receipts${retries ? ` after ${plural(retries, 'retry', 'retries')}` : ''}.`;
      break;
    }
    default:
      break;
  }
  if (step.status === 'skipped') return 'Skipped.';
  return tidySummary(step.summary, ctx.rewrite);
}
