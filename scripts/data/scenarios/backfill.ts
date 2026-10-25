/**
 * ~220 backfill cards, generated from recurring THEME SEEDS × accounts × weeks with a seeded RNG,
 * so clustering finds real themes with believable frequencies and trends.
 * Window: ISO weeks 38–43 (2026-09-14 → 2026-10-23).
 */
import type { InsightType, ProductArea, Severity } from '../../../src/shared/contracts.ts';
import { createRng, type Rng } from '../lib/rng.ts';
import type { Attendee, Card, PlantedInsight, RenderStyle } from '../lib/types.ts';
import { accountById } from '../world.ts';
import { ACCOUNT_TZ, CONTACTS, csmOf } from './contacts.ts';

export type ThemeSeed = {
  id: string;
  name: string;
  type: InsightType;
  area: ProductArea;
  severity: [Severity, number][];
  accounts: [string, number][];
  count: number;
  /** Relative weight per week, W38..W43. */
  weeks: [number, number, number, number, number, number];
  summary: string;
  /** Optional "area:" prefix means the angle needs that product on the account. */
  angles: string[];
  /** Customer titles most likely to raise it (substring match on contact title). */
  raisedBy: string[];
};

export const THEME_SEEDS: ThemeSeed[] = [
  {
    id: 'gads_lag', name: 'Offline conversions lag in Google Ads', type: 'bug', area: 'integrations',
    severity: [['high', 0.6], ['medium', 0.4]],
    accounts: [['acct_brightline', 3], ['acct_atlas', 3], ['acct_sunpeak', 3], ['acct_ridgeway', 3], ['acct_evergreen', 2], ['acct_coastal', 2], ['acct_cedarridge', 2]],
    count: 32, weeks: [1, 1, 2, 3, 6, 8],
    summary: 'Invoca offline call conversions reach Google Ads one to three days after the call, so Smart Bidding optimizes on incomplete data.',
    angles: [
      'Smart Bidding pulls back spend on days that look like they had no conversions',
      'they compared call dates to the conversion date column in Google Ads and found a 2-3 day gap',
      'cost per lead or CPA has jumped since mid-September',
      'their agency asked why conversions arrive in batches every few days',
      'the owner or CMO noticed it in the weekly numbers',
      'they checked GCLID capture and the Invoca tag and nothing changed on their side',
      'they moved one campaign to manual bidding as a stopgap',
      'Google Ads shows the conversions eventually, just days late, which makes daily budget calls impossible',
    ],
    raisedBy: ['Marketing', 'Growth', 'Digital', 'Internet', 'BDC', 'Owner', 'Ecommerce'],
  },
  {
    id: 'sai_spam', name: 'Signal AI mislabels after-hours callers as spam', type: 'bug', area: 'signal_ai',
    severity: [['medium', 0.6], ['high', 0.4]],
    accounts: [['acct_brightline', 2], ['acct_evergreen', 2], ['acct_northwind', 2], ['acct_keystone', 2], ['acct_harbor', 2], ['acct_cedarridge', 1]],
    count: 22, weeks: [2, 3, 3, 4, 4, 4],
    summary: 'Signal AI spam detection flags legitimate after-hours or weekend callers as spam, removing real customers from reporting.',
    angles: [
      'late-night calls flagged as spam were real customers',
      'weekend calls are the worst',
      'short, urgent calls where the caller just gives an address get flagged',
      'they listened to a sample of spam-tagged calls and most were real',
      'spam-tagged calls drop out of campaign reporting so after-hours ads look bad',
      'callers who hang up and call right back get tagged',
    ],
    raisedBy: ['Operations', 'Dispatch', 'Marketing', 'Analytics', 'Member', 'Contact Center', 'Owner'],
  },
  {
    id: 'presense_genesys', name: 'PreSense data missing on Genesys transfers', type: 'bug', area: 'presense',
    severity: [['high', 0.7], ['critical', 0.1], ['medium', 0.2]],
    accounts: [['acct_northwind', 3], ['acct_keystone', 3], ['acct_bluewater', 3], ['acct_meridian', 1]],
    count: 18, weeks: [1, 2, 4, 4, 4, 3],
    summary: 'When Genesys transfers a call between queues or agents, the PreSense screen pop arrives blank for the receiving agent.',
    angles: [
      'warm transfers lose the PreSense screen pop',
      'blind transfers between queues arrive blank',
      'started after the Genesys update in early October',
      'the second agent has to ask the caller what they were looking at',
      'supervisors are escalating it internally',
      'they tested a batch of transfers and counted how many arrived blank',
    ],
    raisedBy: ['Contact Center', 'Technology', 'Telephony', 'Operations', 'Sales Operations'],
  },
  {
    id: 'addon_pricing', name: 'Add-on pricing friction at renewal', type: 'pricing_objection', area: 'billing_pricing',
    severity: [['medium', 0.7], ['high', 0.3]],
    accounts: [['acct_brightline', 1], ['acct_sunpeak', 2], ['acct_atlas', 2], ['acct_harbor', 2], ['acct_coastal', 1], ['acct_bluewater', 2], ['acct_northwind', 2], ['acct_ridgeway', 1]],
    count: 22, weeks: [1, 2, 3, 4, 5, 7],
    summary: 'Finance and procurement push back on paying separately for add-ons (PreSense, QM seats, AI Voice Agent minutes) at renewal.',
    angles: [
      'presense:PreSense as a separate add-on feels like paying twice',
      'quality_management:QM priced per seat for part-time or seasonal agents',
      'ai_agents:AI Voice Agent priced per minute on top of the platform fee',
      'signal_ai:Signal AI priced as an add-on on top of call tracking',
      'procurement wants everything in one bundled price',
      'finance compared this year to last year line by line',
      'a budget freeze for next year means flat spend at best',
    ],
    raisedBy: ['Finance', 'Controller', 'Procurement', 'VP', 'COO', 'Director', 'General Manager'],
  },
  {
    id: 'sfdc_mapping', name: 'Salesforce field mapping breaks on custom objects', type: 'bug', area: 'integrations',
    severity: [['medium', 0.8], ['high', 0.2]],
    accounts: [['acct_keystone', 2], ['acct_frontier', 3], ['acct_harbor', 2], ['acct_bluewater', 2], ['acct_meridian', 2]],
    count: 18, weeks: [3, 3, 3, 3, 3, 3],
    summary: 'The Salesforce integration stops writing call data to custom objects when fields or picklist values change.',
    angles: [
      'adding a field to a custom object breaks the sync',
      'a new picklist value stops records from writing',
      'after a sandbox refresh the mapping had to be rebuilt',
      'call outcome lands in the wrong field on the custom object',
      'the admin gets sync error emails every morning',
      'standard objects are fine, only custom objects break',
    ],
    raisedBy: ['Salesforce', 'CRM', 'Platform', 'Administrator', 'Operations'],
  },
  {
    id: 'hipaa_redaction', name: 'Want HIPAA-safe transcript redaction controls', type: 'feature_request', area: 'signal_ai',
    severity: [['medium', 0.5], ['high', 0.5]],
    accounts: [['acct_meridian', 3], ['acct_cedarridge', 2], ['acct_keystone', 1], ['acct_frontier', 1], ['acct_bluewater', 1]],
    count: 12, weeks: [1, 2, 2, 2, 2, 3],
    summary: 'Regulated customers want configurable redaction of identifiers in transcripts and summaries, with role-based access and audit.',
    angles: [
      'role-based access so only compliance sees unredacted transcripts',
      'choose which identifiers are redacted (DOB, member IDs, account numbers)',
      'an audit log of who viewed a transcript',
      'retention settings to auto-delete transcripts after a set period',
      'redaction applied to AI summaries, not just transcripts',
      'legal review of the BAA raised the question',
    ],
    raisedBy: ['Compliance', 'Privacy', 'Operations', 'VP', 'Practice'],
  },
  {
    id: 'callrail_sync', name: 'CallRail same-day sync pitch', type: 'competitor_mention', area: 'integrations',
    severity: [['medium', 0.8], ['low', 0.2]],
    accounts: [['acct_brightline', 1], ['acct_evergreen', 2], ['acct_sunpeak', 2], ['acct_coastal', 1], ['acct_ridgeway', 1], ['acct_cedarridge', 1]],
    count: 14, weeks: [1, 1, 2, 2, 4, 4],
    summary: 'CallRail is pitching same-day conversion sync to Google Ads, often with a lower quote.',
    angles: [
      'a CallRail rep keeps emailing about same-day sync',
      'CallRail sent a quote that was noticeably lower',
      'their agency recommended looking at CallRail',
      'a peer at another company says CallRail syncs faster',
      'CallRail offered a free trial and a demo',
    ],
    raisedBy: ['Marketing', 'Growth', 'Owner', 'Digital', 'Ecommerce'],
  },
  {
    id: 'voice_agent_handoff', name: 'AI Voice Agent handoff loses context', type: 'bug', area: 'ai_agents',
    severity: [['high', 0.6], ['medium', 0.4]],
    accounts: [['acct_keystone', 2], ['acct_northwind', 2], ['acct_coastal', 2], ['acct_prairielink', 2], ['acct_sunpeak', 2]],
    count: 16, weeks: [2, 2, 3, 3, 3, 3],
    summary: 'When the AI Voice Agent transfers to a live agent, the details it collected do not arrive, so callers repeat themselves.',
    angles: [
      'the caller has to repeat their account or policy number',
      'the transfer note is empty',
      'the voice agent sends callers to the wrong queue',
      'CSAT on transferred calls is lower than on fully automated calls',
      'agents have stopped trusting the handoff and start from scratch',
    ],
    raisedBy: ['Contact Center', 'Care', 'Claims', 'Sales', 'Operations'],
  },
  {
    id: 'qm_custom', name: 'QM scorecards need custom criteria', type: 'feature_request', area: 'quality_management',
    severity: [['medium', 0.85], ['low', 0.15]],
    accounts: [['acct_meridian', 2], ['acct_keystone', 2], ['acct_harbor', 2], ['acct_bluewater', 2], ['acct_frontier', 2]],
    count: 14, weeks: [2, 2, 2, 3, 3, 2],
    summary: 'Customers want to define their own QM scorecard criteria (exact disclosures, call-type-specific scoring, weighting).',
    angles: [
      'check exact required disclosure language',
      'a different scorecard per call type',
      'weight criteria differently for new versus tenured agents',
      'match the human QA team\'s existing rubric',
      'score a policy-specific behaviour the templates do not cover',
    ],
    raisedBy: ['Quality', 'QA', 'Compliance', 'Contact Center', 'Operations'],
  },
  {
    id: 'marchex_auto', name: 'Marchex pricing undercut in automotive', type: 'competitor_mention', area: 'billing_pricing',
    severity: [['high', 0.5], ['medium', 0.5]],
    accounts: [['acct_atlas', 3], ['acct_ridgeway', 3]],
    count: 9, weeks: [1, 1, 1, 2, 2, 2],
    summary: 'Marchex is quoting lower per-rooftop pricing to dealer groups, sometimes with call scoring included.',
    angles: [
      'Marchex quoted a lower per-rooftop price',
      'Marchex is offering free months to switch',
      'Marchex is bundling call scoring into its price',
      'another dealer group in the area switched to Marchex',
    ],
    raisedBy: ['General Manager', 'VP', 'Controller', 'Internet', 'BDC'],
  },
  {
    id: 'dashboard_export', name: 'Dashboard export to Looker/Sheets', type: 'feature_request', area: 'platform',
    severity: [['low', 0.7], ['medium', 0.3]],
    accounts: [['acct_atlas', 1], ['acct_sunpeak', 1], ['acct_prairielink', 2], ['acct_coastal', 1], ['acct_harbor', 1], ['acct_evergreen', 1], ['acct_frontier', 2], ['acct_northwind', 1]],
    count: 16, weeks: [3, 3, 3, 2, 3, 2],
    summary: 'Customers want dashboards delivered to Looker, Google Sheets or BI tools on a schedule instead of manual CSV exports.',
    angles: [
      'a native Looker connection',
      'a scheduled export to Google Sheets',
      'an API endpoint for dashboard metrics',
      'a weekly emailed report for executives',
      'someone exports CSVs by hand every Monday',
    ],
    raisedBy: ['Marketing', 'Analytics', 'Digital', 'Operations', 'Analyst', 'SVP'],
  },
  {
    id: 'dni_spa', name: 'DNI number swap fails on single-page apps', type: 'bug', area: 'call_tracking',
    severity: [['medium', 0.6], ['high', 0.4]],
    accounts: [['acct_prairielink', 2], ['acct_coastal', 1], ['acct_frontier', 1], ['acct_sunpeak', 1]],
    count: 9, weeks: [0, 1, 2, 2, 2, 2],
    summary: 'Dynamic number insertion stops swapping numbers after client-side route changes on single-page apps.',
    angles: [
      'the number reverts to the default after navigating within the app',
      'only the first page load gets the tracking number',
      'mobile click-to-call shows the default number',
      'calls from the new checkout show up as direct traffic',
    ],
    raisedBy: ['Web', 'Digital', 'Ecommerce', 'Marketing'],
  },
  {
    id: 'praise_summaries', name: 'Teams love AI call summaries', type: 'praise', area: 'signal_ai',
    severity: [['low', 1]],
    accounts: [['acct_brightline', 2], ['acct_cedarridge', 2], ['acct_evergreen', 1], ['acct_harbor', 2], ['acct_meridian', 1], ['acct_atlas', 1], ['acct_keystone', 1], ['acct_sunpeak', 1]],
    count: 18, weeks: [3, 3, 3, 3, 3, 3],
    summary: 'Front-line teams say AI call summaries save time on callbacks, dispatch and handoffs.',
    angles: [
      'saves time on callbacks',
      'managers read them instead of listening to recordings',
      'new hires ramp faster reading summaries',
      'dispatch reads the summary instead of listening to the first minute',
      'the summary is accurate enough that they trust it',
    ],
    raisedBy: ['Operations', 'Dispatch', 'Practice', 'Member', 'BDC', 'Contact Center', 'Sales'],
  },
  {
    id: 'praise_presense', name: 'PreSense routing lifts conversion', type: 'praise', area: 'presense',
    severity: [['low', 0.7], ['medium', 0.3]],
    accounts: [['acct_keystone', 2], ['acct_frontier', 2], ['acct_coastal', 2], ['acct_northwind', 1], ['acct_meridian', 1]],
    count: 12, weeks: [2, 2, 2, 2, 2, 2],
    summary: 'PreSense routing and context help agents close more calls from digital shoppers.',
    angles: [
      'conversion on routed calls is up',
      'agents like seeing what the caller browsed',
      'handle time dropped because agents start with context',
      'routing high-intent callers to the best agents paid off',
    ],
    raisedBy: ['VP', 'SVP', 'Contact Center', 'Sales', 'Ecommerce', 'Marketing'],
  },
];

const WEEK_START = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19'];
const SHORT: Record<string, string> = {
  acct_brightline: 'Brightline', acct_meridian: 'Meridian', acct_atlas: 'Atlas', acct_keystone: 'Keystone', acct_northwind: 'Northwind',
  acct_harbor: 'HarborFCU', acct_sunpeak: 'SunPeak', acct_cedarridge: 'CedarRidge', acct_evergreen: 'Evergreen', acct_coastal: 'CoastalComfort',
  acct_ridgeway: 'Ridgeway', acct_bluewater: 'Bluewater', acct_prairielink: 'PrairieLink', acct_frontier: 'Frontier',
};
export const accountShort = (id: string): string => SHORT[id] ?? id;

type Slot = { theme: ThemeSeed; accountId: string; week: number; severity: Severity; angle: string };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function pickContacts(rng: Rng, accountId: string, hints: string[], n: number): Attendee[] {
  const all = CONTACTS[accountId] ?? [];
  const scored = rng.shuffle(all).sort((a, b) => {
    const s = (t: string) => (hints.some((h) => t.toLowerCase().includes(h.toLowerCase())) ? 0 : 1);
    return s(a.title) - s(b.title);
  });
  return scored.slice(0, Math.min(n, scored.length)).map((x) => ({ name: x.name, org: 'customer', title: x.title, email: x.email }));
}

function filenameFor(rng: Rng, render: RenderStyle, accountId: string, callType: string, d: Date, local: { y: number; m: number; day: number; h: number; min: number }): string {
  const s = accountShort(accountId);
  const lower = s.toLowerCase();
  const ymd = `${local.y}-${pad(local.m)}-${pad(local.day)}`;
  const compact = `${local.y}${pad(local.m)}${pad(local.day)}`;
  const ct = callType.replace(/\s+/g, '-');
  const ctTitle = callType.replace(/(^|\s)\w/g, (x) => x.toUpperCase()).replace(/\s+/g, '');
  switch (render) {
    case 'vtt_zoom': {
      const utc = d.toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
      return rng.chance(0.5) ? `GMT${utc}_${s}-${ctTitle}.transcript.vtt` : `${ymd}_${s}_${ctTitle}.vtt`;
    }
    case 'vtt_asr':
      return `${lower}_${ct}_${compact}_auto.vtt`;
    case 'txt_bracket':
      return rng.chance(0.5) ? `${lower}-${ct}-${ymd}.txt` : `${s} ${callType} ${pad(local.m)}-${pad(local.day)}.txt`;
    case 'txt_otter':
      return `${s} - ${callType} (Otter) ${pad(local.m)}-${pad(local.day)}.txt`;
    case 'txt_asr':
      return rng.chance(0.5) ? `rec_${compact}_${lower}_raw.txt` : `audio_${pad(local.m)}${pad(local.day)}_${lower}.txt`;
    case 'md':
      return `${lower}-${ct}-notes-${ymd}.md`;
    case 'chat_slack':
      return `slack-export_${lower}_${pad(local.m)}${pad(local.day)}.txt`;
    case 'txt_dump':
      return `${lower}-scratch-${pad(local.m)}${pad(local.day)}.txt`;
    case 'eml':
      return `RE_ ${s} follow-up.eml`;
  }
}

function localParts(iso: string): { y: number; m: number; day: number; h: number; min: number } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error(`bad iso ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), day: Number(m[3]), h: Number(m[4]), min: Number(m[5]) };
}

export function buildBackfillCards(seed = 'signal-loop-backfill-v1'): Card[] {
  const rng = createRng(seed);
  const slots: Slot[] = [];
  for (const t of THEME_SEEDS) {
    const r = rng.fork(t.id);
    const angles = r.shuffle(t.angles);
    for (let i = 0; i < t.count; i++) {
      const accountId = r.weighted(t.accounts.map((a) => a[0]), t.accounts.map((a) => a[1]));
      const week = r.weighted([0, 1, 2, 3, 4, 5], t.weeks);
      const severity = r.weighted(t.severity.map((s) => s[0]), t.severity.map((s) => s[1]));
      const owned = accountById(accountId).products as string[];
      const usable = angles.filter((a) => {
        const m = a.match(/^([a-z_]+):/);
        return !m || owned.includes(m[1] as string);
      });
      const angle = (usable[i % usable.length] as string).replace(/^[a-z_]+:/, '');
      slots.push({ theme: t, accountId, week, severity, angle });
    }
  }

  // Group by account × week and pack into calls of 1–3 insights.
  const groups = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = `${s.accountId}|${s.week}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  type Pack = { accountId: string; week: number; slots: Slot[] };
  const packs: Pack[] = [];
  const pr = rng.fork('pack');
  for (const [k, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [accountId, w] = k.split('|') as [string, string];
    const queue = pr.shuffle(list);
    while (queue.length) {
      const n = Math.min(queue.length, pr.chance(0.05) ? 3 : pr.chance(0.2) ? 2 : 1);
      // avoid two insights of the same theme in one call
      const take: Slot[] = [];
      for (let i = 0; i < queue.length && take.length < n; i++) {
        const s = queue[i] as Slot;
        if (!take.some((x) => x.theme.id === s.theme.id)) take.push(s);
      }
      for (const s of take) queue.splice(queue.indexOf(s), 1);
      packs.push({ accountId, week: Number(w), slots: take });
    }
  }

  // Churn signals ride along on bug/pricing calls at watch/at-risk accounts, mostly in later weeks.
  const cr = rng.fork('churn');
  const churnCandidates = packs.filter((p) => {
    const a = accountById(p.accountId);
    return a.health !== 'healthy' && p.week >= 2 && p.slots.some((s) => s.theme.type === 'bug' || s.theme.type === 'pricing_objection');
  });
  const churnPacks = new Set(cr.shuffle(churnCandidates).slice(0, 14));

  // Nothing-actionable calls: 20 spread across accounts and weeks.
  const nr = rng.fork('negatives');
  const accountIds = Object.keys(SHORT);
  for (let i = 0; i < 20; i++) packs.push({ accountId: accountIds[i % accountIds.length] as string, week: nr.int(0, 5), slots: [] });

  const cards: Card[] = [];
  const usedNames = new Set<string>();
  packs.forEach((p, idx) => {
    const r = rng.fork(`card-${idx}`);
    const account = accountById(p.accountId);
    const hasChurn = churnPacks.has(p);
    const level = r.weighted([1, 2, 3, 4, 5], [0.05, 0.34, 0.34, 0.23, 0.04]) as 1 | 2 | 3 | 4 | 5;
    const render: RenderStyle =
      level === 1 ? 'md'
        : level === 2 ? r.pick(['vtt_zoom', 'txt_bracket'] as const)
          : level === 3 ? r.pick(['vtt_zoom', 'txt_otter'] as const)
            : level === 4 ? r.pick(['txt_asr', 'vtt_asr'] as const)
              : r.pick(['chat_slack', 'txt_dump'] as const);
    const kind = render === 'md' ? 'notes_md' : render === 'chat_slack' ? 'chaos_chat' : render === 'txt_dump' ? 'chaos_dump' : 'transcript';
    const format = render === 'md' ? 'md' : render.startsWith('vtt') ? 'vtt' : render === 'chat_slack' ? 'chat' : 'txt';
    const types = p.slots.map((s) => s.theme.type);
    const callType = p.slots.length === 0
      ? r.pick(['check-in', 'check-in', 'training follow-up', 'onboarding'])
      : hasChurn || types.includes('pricing_objection') ? r.pick(['renewal', 'check-in', 'exec sponsor'])
        : p.slots.some((s) => s.severity === 'high' || s.severity === 'critical') && r.chance(0.4) ? 'escalation'
          : r.pick(['check-in', 'check-in', 'check-in', 'QBR', 'working session']);
    const callTypeFinal = kind === 'chaos_chat' || kind === 'chaos_dump' ? 'notes' : callType;

    // weekday 0–4, business hours local
    const dayOffset = r.int(0, 4);
    const hour = r.int(8, 16);
    const minute = r.pick([0, 0, 15, 30, 30, 45]);
    const base = new Date(`${WEEK_START[p.week]}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + dayOffset);
    const tz = ACCOUNT_TZ[p.accountId] ?? '-05:00';
    const startedAt = `${base.toISOString().slice(0, 10)}T${pad(hour)}:${pad(minute)}:00${tz}`;
    const d = new Date(startedAt);

    const hints = [...new Set(p.slots.flatMap((s) => s.theme.raisedBy))];
    const contacts = pickContacts(r, p.accountId, hints, r.chance(0.55) ? 1 : 2);
    const csm = csmOf(p.accountId);
    const attendees: Attendee[] = [...contacts, csm];

    const insights: PlantedInsight[] = p.slots.map((s) => {
      const speaker = (kind === 'chaos_chat' || kind === 'chaos_dump' || kind === 'notes_md') ? csm.name : r.pick(contacts).name;
      return {
        type: s.theme.type, productArea: s.theme.area, severity: s.severity,
        summary: s.theme.summary, quote: '', speaker, angle: s.angle, themeId: s.theme.id,
      };
    });
    if (hasChurn) {
      const anchor = p.slots.find((s) => s.theme.type === 'bug' || s.theme.type === 'pricing_objection') as Slot;
      insights.push({
        type: 'churn_risk', productArea: anchor.theme.area, severity: r.chance(0.75) ? 'high' : 'medium',
        summary: `Customer links "${anchor.theme.name.toLowerCase()}" to the renewal decision.`, quote: '',
        speaker: kind === 'transcript' ? r.pick(contacts).name : csm.name,
        angle: r.pick([
          'a hedged threat to look at alternatives before renewal',
          'their boss is asking whether to renew',
          'they might reduce scope or drop a product at renewal',
          'they have started taking competitor calls',
        ]),
        themeId: 'churn_signal',
      });
    }

    const lp = localParts(startedAt);
    let filename = filenameFor(r, render, p.accountId, callTypeFinal, d, lp);
    while (usedNames.has(filename)) filename = filename.replace(/(\.[a-z]+)$/, `-2$1`);
    usedNames.add(filename);

    const words = level === 1 ? r.int(240, 380) : kind === 'chaos_chat' || kind === 'chaos_dump' ? r.int(280, 450) : level === 4 ? r.int(420, 680) : r.int(450, 820);
    const negative = p.slots.length === 0;
    cards.push({
      fileId: `file_bf_${String(idx + 1).padStart(3, '0')}`,
      accountId: p.accountId, callType: callTypeFinal, startedAt,
      messLevel: level, edgeKind: null, featured: false, tourPath: null, recommended: false,
      filename, folder: '', format, kind, render, corruptLevel: level,
      attendees, language: 'en', targetWords: words,
      brief: negative
        ? `A routine ${callTypeFinal} with ${account.name}. Logistics, rapport and neutral status only (scheduling, training dates, user changes, seasonal volume). The customer has NO product feedback: no problems, requests, pricing, competitors, renewal concerns or specific praise.`
        : `A ${callTypeFinal} between ${csm.name} (Invoca CSM) and ${account.name} (${account.vertical.replace('_', ' ')}, ${account.hq}). ${account.notes} Besides the feedback below, include some ordinary account business (volumes, a staffing note, scheduling, a short tangent).`,
      insights,
      expectActionable: !negative, expectInjectionFlag: false, quoteMode: 'reported',
    });
  });
  return cards;
}
