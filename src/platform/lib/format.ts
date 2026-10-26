/**
 * Number and time formatting for Agent Ops. Null renders as "—". Estimates are named as
 * estimates in their labels ("Estimated value"), not marked with a "~" in the number.
 */
import type { ConsoleTimezone } from '../../ds/time/format';
import { pctText } from '../../shared/format';

export const DASH = '—';

export function int(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return Math.round(v).toLocaleString('en-US');
}
export function num(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function money(v: number | null | undefined, opts: { est?: boolean; precise?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  if (v === 0) return '$0';
  const abs = Math.abs(v);
  let s: string;
  if (opts.precise) s = abs < 0.00005 ? 'under 1¢' : `$${v.toFixed(abs < 0.01 ? 4 : abs < 1 ? 3 : 2)}`;
  else if (abs < 0.01) s = 'under 1¢';
  else if (abs < 1) s = `$${v.toFixed(2)}`;
  else if (abs < 100) s = `$${v.toFixed(2)}`;
  else s = `$${Math.round(v).toLocaleString('en-US')}`;
  return s;
}
export function compactMoney(v: number | null | undefined, est = false): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  void est;
  return Math.abs(v) >= 10_000 ? `$${(v / 1000).toFixed(1)}k` : money(v);
}
export function hours(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${Math.abs(v) >= 100 ? int(v) : num(v, 1)} h`;
}
export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return pctText(v, digits);
}
export function signedPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const p = Math.round(v * 100);
  return `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)}%`;
}
/**
 * Agent colours: the design system's chart ramp (--chart-1…6). Registry records carry a hex;
 * known palette values (and older seeded ones) map onto the matching token, so colour follows
 * the agent and changes in tokens.css only.
 */
const CHART_TOKEN: Record<string, string> = {
  '#008463': 'var(--chart-1)',
  '#00A87F': 'var(--chart-1)',
  '#2F5DB8': 'var(--chart-2)',
  '#5E74E3': 'var(--chart-2)',
  '#C2780C': 'var(--chart-3)',
  '#7A4FB5': 'var(--chart-4)',
  '#3E8E9E': 'var(--chart-5)',
  '#B5475A': 'var(--chart-6)',
};
const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'];
export function seriesColor(c: string | null | undefined, index = 0): string {
  if (!c) return SERIES[index % SERIES.length]!;
  return CHART_TOKEN[c.toUpperCase()] ?? c;
}

export function multiple(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  if (v >= 1000) return '1,000×+';
  return `${v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1)}×`;
}
/** A duration. Code-only work that finishes inside a millisecond reads "<1 ms", never "0 ms". */
export function ms(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  if (v < 1) return '<1 ms';
  if (v < 1000) return `${Math.round(v)} ms`;
  if (v < 60_000) return `${(v / 1000).toFixed(v < 10_000 ? 2 : 1)} s`;
  const m = Math.floor(v / 60_000);
  return `${m}m ${Math.round((v % 60_000) / 1000)}s`;
}

/** An offset on a time axis ("0 ms" is the origin, not a duration). */
export function offset(v: number | null | undefined): string {
  if (v === 0) return '0 ms';
  return ms(v);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 21" from YYYY-MM-DD or ISO (UTC calendar date). */
export function day(v: string | null | undefined): string {
  if (!v) return DASH;
  const d = new Date(v.length <= 10 ? `${v}T12:00:00Z` : v);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
export function dayYear(v: string | null | undefined): string {
  if (!v) return DASH;
  const d = new Date(v.length <= 10 ? `${v}T12:00:00Z` : v);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
export function range(from: string, to: string): string {
  return `${day(from)} – ${dayYear(to)}`;
}

function parts(v: string, tz: ConsoleTimezone) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(v)).map((x) => [x.type, x.value]));
  return { md: `${p.month} ${p.day}`, hm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}`, hms: `${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}` };
}
export function tzLabel(tz: ConsoleTimezone): string {
  return tz === 'UTC' ? 'UTC' : 'PT';
}
export function time(v: string | null | undefined, tz: ConsoleTimezone, withSeconds = false): string {
  if (!v) return DASH;
  const p = parts(v, tz);
  return `${p.md} ${withSeconds ? p.hms : p.hm} ${tzLabel(tz)}`;
}
/** "Oct 24, 14:03:12" in the chosen zone: a readable log timestamp. */
export function stamp(v: string | null | undefined, tz: ConsoleTimezone): string {
  if (!v) return DASH;
  const p = parts(v, tz);
  return `${p.md}, ${p.hms}`;
}
export function clock(v: string | null | undefined, tz: ConsoleTimezone): string {
  if (!v) return DASH;
  return `${parts(v, tz).hms}`;
}
export function ago(v: string | null | undefined, now = Date.now()): string {
  if (!v) return DASH;
  const s = Math.max(0, Math.round((now - Date.parse(v)) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const ROLE_LABEL: Record<string, string> = {
  csm: 'CSM',
  pm: 'Product manager',
  vp_product: 'VP Product',
  rfp: 'Proposal manager',
  sales_eng: 'Solutions consultant',
  ae: 'Account executive',
  viewer: 'Demo viewer (live)',
  owner: 'Owner (Hunter)',
  ai_ops: 'AI Operations',
};
export function role(r: string): string {
  return ROLE_LABEL[r] ?? r.replace(/_/g, ' ');
}

export const KIND_LABEL: Record<string, string> = {
  session_start: 'Session started',
  page_view: 'Page view',
  run_created: 'Run started',
  run_viewed: 'Run viewed',
  review_action: 'Review decision',
  insight_opened: 'Insight opened',
  rule_changed: 'Routing rule changed',
  ticket_state: 'Ticket state changed',
  notification_opened: 'Notification opened',
  digest_opened: 'Digest opened',
  theme_opened: 'Theme opened',
  eval_promote: 'Prompt promotion attempted',
  tour_step: 'Walkthrough step',
  tour_complete: 'Walkthrough completed',
  export: 'Export',
  search: 'Search',
  agent_invoked: 'Agent invoked',
  output_accepted: 'Output accepted',
  output_edited: 'Output edited',
  output_rejected: 'Output rejected',
};
export function kind(k: string): string {
  return KIND_LABEL[k] ?? k.replace(/_/g, ' ');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
