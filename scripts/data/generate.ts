/**
 * Writes the CLEAN version of every scenario card with the build model, validates it against the
 * card (required lines present, right speaker, no AI tells, no stray feedback words), retries with
 * feedback, and caches results in data/.cache/gen/<fileId>.json.
 *
 *   node --env-file=.env scripts/data/generate.ts [--featured] [--only file_x,file_y] [--concurrency 8]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { chatJson, pool, spentUsd } from './lib/llm.ts';
import type { Card, GenOutput, GenTurn } from './lib/types.ts';
import { locateQuote, normalize } from './relocate.ts';
import { allCards } from './scenarios.ts';
import { INTEGRATIONS_USED, reservedFirstNames } from './scenarios/contacts.ts';
import { accountById, DATA_DIR } from './world.ts';

export const GEN_DIR = join(DATA_DIR, '.cache', 'gen');

export type GenRecord = { fileId: string; output: GenOutput; quotes: string[]; attempts: number; warnings: string[]; extras?: Extra[] };

// ------------------------------------------------------------------ output schemas

const Turns = z.array(z.object({ speaker: z.string().min(1), text: z.string().min(1) })).min(4);
const Email = z.object({
  from: z.string().min(1), to: z.array(z.string()).min(1), cc: z.array(z.string()).optional(),
  subject: z.string().optional(), body: z.string().min(20), signature: z.string().optional(), minutesBefore: z.number().optional(),
});
const QuoteItem = z.union([z.string(), z.object({ text: z.string() }).transform((o) => o.text), z.object({ quote: z.string() }).transform((o) => o.quote)]);
const Quotes = z.array(QuoteItem).optional();
const SCHEMAS = {
  transcript: z.object({ turns: Turns, quotes: Quotes }),
  notes_md: z.object({ markdown: z.string().min(100), quotes: Quotes }),
  email_thread: z.object({ emails: z.array(Email).min(1), quotes: Quotes }),
  chaos_eml: z.object({ forwardNote: z.string().min(10), emails: z.array(Email).min(1), transcriptExcerpt: Turns.or(z.array(z.object({ speaker: z.string(), text: z.string() }))), quotes: Quotes }),
  chaos_chat: z.object({ messages: z.array(z.object({ user: z.string().min(1), text: z.string().min(1), minutesAfterStart: z.number().optional(), threaded: z.boolean().optional() })).min(6), quotes: Quotes }),
  chaos_dump: z.object({ text: z.string().min(100), quotes: Quotes }),
} as const;

// ------------------------------------------------------------------ prompt

const PRODUCT_LABEL: Record<string, string> = {
  call_tracking: 'Call Tracking', signal_ai: 'Signal AI', presense: 'PreSense', quality_management: 'AI-Powered QM',
  ai_agents: 'AI Voice Agent / AI Messaging Agent', billing_pricing: 'billing', platform: 'reporting',
};

export const SYSTEM_PROMPT = `You write synthetic but completely realistic material for a test dataset at Invoca: transcripts of calls between Invoca customer success managers (CSMs) and their customers, CSM notes, email threads and Slack exports. Invoca product leaders will read these and must find them indistinguishable from the real thing.

INVOCA CONTEXT (use accurately; never invent features or numbers about Invoca itself):
- Invoca is a conversation intelligence and call tracking platform used by marketers and contact centers in home services, healthcare, automotive, insurance, financial services, telecom, solar and retail.
- Call Tracking & Attribution: tracking numbers per campaign, dynamic number insertion (DNI) through the Invoca tag on the website, call flows and IVR routing, attribution of calls to campaigns, keywords and pages.
- Signal AI: classifies every call with "signals" (for example appointment booked, quote given, spam). Signal AI Studio builds custom signals; Signal Discovery surfaces topics. Transcripts, AI call summaries and PII redaction.
- Integrations: sends call conversions to Google Ads as offline conversions (matched by GCLID) for Smart Bidding; also Meta, Adobe Analytics, Marketo, Salesforce (call records and outcomes written to Salesforce objects), and contact-center platforms Five9, Genesys, NICE and Amazon Connect.
- PreSense: passes the caller's digital journey (ad, pages viewed, product) to the contact-center agent as a screen pop before they answer, and can route by intent. Sold as an add-on.
- AI-Powered Quality Management (QM): scores 100% of calls against scorecards for coaching and compliance. Priced per seat.
- AI Voice Agent answers calls, handles routine requests and transfers to a live agent. AI Messaging Agent handles SMS follow-up.
- Competitors customers sometimes name: CallRail, Marchex, CallTrackingMetrics, WhatConverts, and Gong where conversation intelligence overlaps.

HOW REAL PEOPLE SOUND:
- Speech: contractions, short turns, partial sentences, "yeah", "okay so", "let me pull that up", people finishing each other's thoughts, an occasional joke. Customers mention their own colleagues by first name, give concrete numbers (call volumes, percentages, days, dollars) and sometimes hedge.
- CSMs are warm and practical, ask clarifying questions, commit to specific follow-ups, and do not pitch or over-promise.
- Notes and Slack are terse. Emails have greetings, sign-offs and signatures.

NEVER:
- Phrases such as "Certainly", "Absolutely!", "Great question", "I hear you", "delve", "seamless", "game-changer", "robust", "leverage", "synergy", "circle back", "touch base", "at the end of the day", "I completely understand", "Thanks for having me", "I appreciate you sharing".
- The em dash character. Use commas, periods or "..." instead.
- A tidy closing in which someone restates every point.
- Real company names other than Invoca, the partners and competitors above, and the customer in the brief. Never mention AI model vendors.
- Product feedback beyond what the request plants: no extra bugs, feature requests, pricing complaints, competitor names, renewal threats or praise of specific features. Everything else is neutral account business, logistics or small talk.

Return only JSON in the requested shape.`;

const KIND_SPEC: Record<Card['kind'], string> = {
  notes_md: `FORMAT: A CSM's call notes in Markdown, team template: a title line (# Account · call type · date), an **Attendees:** line, then sections "## Summary" (2-3 sentences, no feedback details), "## Discussion" (bullets on the other topics: numbers, logistics, context; do not repeat feedback here), "## Product feedback" (one bullet per required line, each required line appearing here and nowhere else in the file), "## Risks" (only if the brief implies one), "## Next steps" (bullets with owner and date). Past tense, terse, the CSM's own voice. Keep numbers internally consistent. Finish every section.
OUTPUT JSON: {"markdown": "<the whole file>"}`,
  transcript: `FORMAT: A call transcript as speaker turns. Use each participant's full name exactly as listed as the speaker. Turns are what one person says before someone else talks.
OUTPUT JSON: {"turns": [{"speaker": "<full name>", "text": "<what they said>"}]}`,
  email_thread: `FORMAT: An email thread, oldest message first. Each email has a greeting, body and sign-off. Put corporate signature blocks in "signature". "minutesBefore" is how long before the newest email it was sent (newest = 0).
OUTPUT JSON: {"emails": [{"from": "<full name>", "to": ["<full name>"], "cc": ["<full name>"], "subject": "...", "body": "...", "signature": "...", "minutesBefore": 0}]}`,
  chaos_eml: `FORMAT: A forwarded email. "forwardNote" is the account's CSM's short, shorthand note on top of the forward, written in the first person to the internal recipients (lowercase is fine, abbreviations, maybe a pasted transcript snippet introduced like "pasting the bit from the recording:"). "emails" is the forwarded thread, oldest first, real greetings and signatures. "transcriptExcerpt" is 3-6 raw lines from the call recording that the CSM pasted (speaker turns; may be empty if the brief has none).
OUTPUT JSON: {"forwardNote": "...", "emails": [{"from": "<full name>", "to": ["<full name>"], "cc": [], "subject": "...", "body": "...", "signature": "...", "minutesBefore": 240}], "transcriptExcerpt": [{"speaker": "<full name>", "text": "..."}]}`,
  chaos_chat: `FORMAT: A Slack export. Each message has "user" (a lowercase handle like first.last), "text", "minutesAfterStart" (increasing) and "threaded" (true for thread replies). Shorthand, lowercase, abbreviations (acct, xfer, w/, b/c, fyi, tbh, rn), emoji codes like :eyes: or :+1:, some one- or two-word messages, a link or two, a meeting-time correction. If the brief mentions a pasted transcript or email, put it inside one message's text as several lines.
OUTPUT JSON: {"messages": [{"user": "first.last", "text": "...", "minutesAfterStart": 0, "threaded": false}]}`,
  chaos_dump: `FORMAT: A raw plain-text file with no consistent structure: shorthand bullets, half sentences, pasted fragments (an email, a few transcript lines, an error message), to-dos, dates. It reads like someone's scratch file.
OUTPUT JSON: {"text": "<the whole file>"}`,
};

function levelStyle(card: Card): string {
  if (card.kind !== 'transcript') return '';
  switch (card.messLevel ?? 2) {
    case 1:
    case 2:
      return 'STYLE: A tidy, well-punctuated transcript. Clear turns, mostly complete sentences, a little filler. A short greeting at the start and a brief sign-off.';
    case 3:
      return 'STYLE: A natural meeting. Small talk at the start and end, filler words (um, uh, like, you know), tangents, people interrupting and resuming, at least one point that takes two or three turns to land.';
    default:
      return 'STYLE: Casual, messy conversation. Write clean words (speech-to-text noise is added later), but with lots of hedging, sarcasm where it fits, short back-and-forth, people trailing off or talking over each other, filler words.';
  }
}

function fmtDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)!;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  const wd = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const mo = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const h = Number(m[4]);
  return `${wd}, ${mo} ${Number(m[3])}, ${m[1]}, ${((h + 11) % 12) + 1}:${m[5]} ${h < 12 ? 'AM' : 'PM'} local`;
}

export function buildUserPrompt(card: Card, feedback: string[]): string {
  const lines: string[] = [];
  if (card.accountId) {
    const a = accountById(card.accountId);
    lines.push(`ACCOUNT: ${a.name} (${a.vertical.replace('_', ' ')}, ${a.tier} tier, HQ ${a.hq}). About $${Math.round(a.arrUsd / 1000)}k ARR, ${a.seats} seats. Invoca products they own: ${a.products.filter((p) => p !== 'integrations').map((p) => PRODUCT_LABEL[p] ?? p).join(', ')}. Platforms connected to Invoca: ${(INTEGRATIONS_USED[a.id] ?? []).join(', ')}. Mention no other Invoca product or partner platform for this account. Renewal ${a.renewalDate}. Context: ${a.notes}`);
    lines.push('(The account facts above are background for you. Do not copy them verbatim into the file.)');
  }
  lines.push(`DATE: ${fmtDate(card.startedAt)}`);
  lines.push(`CALL TYPE: ${card.callType}`);
  lines.push('PARTICIPANTS:');
  for (const p of card.attendees) lines.push(`- ${p.name}, ${p.title}, ${p.org === 'invoca' ? 'Invoca' : card.accountId ? accountById(card.accountId).name : 'customer'}${p.email ? ` <${p.email}>` : ''}`);
  lines.push(`SCENARIO: ${card.brief}`);
  const turnHint = card.kind === 'transcript' ? `, roughly ${Math.round(card.targetWords / 22)}-${Math.round(card.targetWords / 14)} turns` : '';
  lines.push(`LENGTH: about ${card.targetWords} words${turnHint}.`);
  if (card.language === 'es') lines.push('LANGUAGE: Write everything in Spanish (natural Mexican-American Spanish as spoken in Texas). Keep product names in English.');
  const style = levelStyle(card);
  if (style) lines.push(style);
  lines.push(KIND_SPEC[card.kind]);

  if (card.quoteMode === 'planted' && card.insights.length) {
    lines.push('REQUIRED LINES. Each must appear exactly as written (same words, same order, same punctuation), said or written by the named person, inside a natural turn or message. Add words before or after it if you like, never inside it. Make the surrounding conversation lead into it naturally:');
    card.insights.forEach((i, n) => lines.push(`${n + 1}. [${i.speaker ?? 'customer'}${i.part ? `, in the ${i.part}` : ''}] "${i.quote}"`));
    lines.push('Use each required line exactly once. Do not wrap it in quotation marks and do not introduce it with "X said:". It is simply part of what that person says or writes.');
  }
  if (card.quoteMode === 'reported' && card.insights.length) {
    lines.push('FEEDBACK TO WORK IN. Put each item in the named person\'s own words, specific to this account (their numbers, their people, their systems). Do not use stock phrasing, and do not name the issue the way a ticket would:');
    card.insights.forEach((i, n) => lines.push(`${n + 1}. [${i.speaker}] ${i.type.replace('_', ' ')} about ${i.productArea.replace('_', ' ')} (severity ${i.severity}). Gist: ${i.summary} Angle: ${i.angle}.`));
    lines.push(`Also return "quotes": an array with one entry per item above, in order. Each entry is ONE sentence copied character for character from your text (8 to 35 words) that carries that item.`);
  }
  if (card.verbatim?.length) {
    lines.push('ALSO INCLUDE THESE EXACT LINES (verbatim, character for character):');
    card.verbatim.forEach((v) => lines.push(`- ${v}`));
  }
  if (card.distractors?.length) {
    lines.push('NEUTRAL DETAILS TO WORK IN (these are not product feedback):');
    card.distractors.forEach((d) => lines.push(`- ${d}`));
  }
  if (!card.insights.length) lines.push('This file must contain NO product feedback at all.');
  lines.push(`RULES FOR THIS FILE: The planted items above are the only product feedback. If other Invoca areas come up, people say they're fine, briefly, with no numbers or caveats that suggest a problem, and nobody praises or criticizes any other feature. Invoca staff never claim a requested capability already exists, never fix a reported problem during the conversation, and never explain a root cause; they ask questions and take it back. Any other people you mention by name must not use these first names: ${reservedFirstNames(card.accountId).join(', ')}.`);
  if (feedback.length) {
    lines.push('YOUR PREVIOUS ATTEMPT HAD PROBLEMS. Fix all of them:');
    feedback.forEach((f) => lines.push(`- ${f}`));
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------ validation

const BANNED = [
  /\bcertainly\b/i, /\babsolutely!/i, /\bgreat question\b/i, /\bi hear you\b/i, /\bdelve\b/i, /\bseamless(ly)?\b/i,
  /\bgame[- ]changer\b/i, /\brobust\b/i, /\bleverag(e|ing)\b/i, /\bsynerg/i, /\btouch base\b/i, /\bat the end of the day\b/i,
  /\bi completely understand\b/i, /\bthanks for having me\b/i, /\bi appreciate you sharing\b/i, /\bdive (in|into)\b/i, /\bdeep dive\b/i,
];

/** Feedback-shaped language that must not appear unless the card plants that kind of insight. */
type Ins = Card['insights'][number];
const STRAY: { name: string; re: RegExp; allowed: (i: Ins) => boolean }[] = [
  { name: 'calls labelled as spam', re: /\bspam\b/i, allowed: (i) => i.productArea === 'signal_ai' },
  { name: 'Google Ads conversion delays', re: /\b(late|delay|delayed|lag|lagging|behind)\b[^.\n]{0,50}google|google[^.\n]{0,60}\b(late|delay|delayed|lag|lagging|behind)\b/i, allowed: (i) => i.productArea === 'integrations' || i.type === 'competitor_mention' || i.type === 'churn_risk' },
  { name: 'PreSense data missing', re: /presense[^.\n]{0,80}\b(blank|missing|empty|drop|drops|dropped|lost|losing)\b/i, allowed: (i) => i.productArea === 'presense' || i.type === 'churn_risk' },
  { name: 'redaction', re: /\bredact/i, allowed: (i) => i.productArea === 'signal_ai' },
  { name: 'exports to Looker, Sheets or CSV', re: /\b(looker|google sheets|csv|power bi|tableau)\b/i, allowed: (i) => i.productArea === 'platform' },
  { name: 'Salesforce sync failures', re: /salesforce[^.\n]{0,80}\b(break|breaks|broke|broken|fail|fails|failing|error|errors|wrong field)\b/i, allowed: (i) => i.productArea === 'integrations' },
  { name: 'tracking number swap failures', re: /\b(dni|number swap|swap)\b[^.\n]{0,60}\b(stopped|fails|failing|broke|broken|default|reverts?)\b/i, allowed: (i) => i.productArea === 'call_tracking' },
  { name: 'custom QM scorecard criteria', re: /scorecard[^.\n]{0,80}\b(custom|criteri)/i, allowed: (i) => i.productArea === 'quality_management' },
  { name: 'voice agent transfers losing context', re: /(voice agent|virtual assistant)[^.\n]{0,120}\b(no context|repeat|again|nothing|blank)\b/i, allowed: (i) => i.productArea === 'ai_agents' },
  { name: 'renewal threats', re: /\b(look around|other options|not (going to )?renew|rfp|switch(ing)? (vendors|providers)|shopping around)\b/i, allowed: (i) => i.type === 'churn_risk' || i.type === 'competitor_mention' || i.type === 'pricing_objection' },
  { name: 'praise for a product feature', re: /\b(love|loves|loving|lifesaver|game changer)\b|\bsaves? (me|her|him|them|us|everyone) (an|a|so|about|like)\b/i, allowed: (i) => i.type === 'praise' },
  { name: 'price complaints', re: /\b(too expensive|price increase|cheaper|discount)\b/i, allowed: (i) => i.type === 'pricing_objection' || i.type === 'competitor_mention' || i.type === 'churn_risk' },
];
const COMPETITORS = ['callrail', 'marchex', 'calltrackingmetrics', 'whatconverts', 'gong'];
// model vendors and other real companies that must not appear
const FORBIDDEN_NAMES = [/\bopenai\b/i, /\bchatgpt\b/i, /\bgpt-?\d/i, /\bclaude\b/i, /\banthropic\b/i, /\bgemini\b/i, /\bllama\b/i, /\bdeepseek\b/i, /\bmistral\b/i];

export function textOf(out: GenOutput): string {
  switch (out.kind) {
    case 'transcript': return out.turns.map((t) => `${t.speaker}: ${t.text}`).join('\n');
    case 'notes_md': return out.markdown;
    case 'email_thread': return out.emails.map((e) => `${e.body}\n${e.signature ?? ''}`).join('\n');
    case 'chaos_eml': return [out.forwardNote, ...out.emails.map((e) => `${e.body}\n${e.signature ?? ''}`), ...out.transcriptExcerpt.map((t) => `${t.speaker}: ${t.text}`)].join('\n');
    case 'chaos_chat': return out.messages.map((m) => `${m.user}: ${m.text}`).join('\n');
    case 'chaos_dump': return out.text;
  }
}

function fixDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*/g, ' - ');
}

function sanitize(out: GenOutput): GenOutput {
  switch (out.kind) {
    case 'transcript': return { ...out, turns: out.turns.map((t) => ({ speaker: t.speaker.trim(), text: fixDashes(t.text.trim()) })) };
    case 'notes_md': return { ...out, markdown: fixDashes(out.markdown) };
    case 'email_thread': return { ...out, emails: out.emails.map((e) => ({ ...e, body: fixDashes(e.body), ...(e.signature ? { signature: e.signature } : {}) })) };
    case 'chaos_eml': return { ...out, forwardNote: fixDashes(out.forwardNote), emails: out.emails.map((e) => ({ ...e, body: fixDashes(e.body) })), transcriptExcerpt: out.transcriptExcerpt.map((t) => ({ speaker: t.speaker, text: fixDashes(t.text) })) };
    case 'chaos_chat': return { ...out, messages: out.messages.map((m) => ({ ...m, text: fixDashes(m.text) })) };
    case 'chaos_dump': return { ...out, text: fixDashes(out.text) };
  }
}

function findTurn(turns: GenTurn[], quote: string): GenTurn | undefined {
  const nq = normalize(quote);
  return turns.find((t) => normalize(t.text).includes(nq));
}

export function validate(card: Card, out: GenOutput): { problems: string[]; quotes: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const all = textOf(out);
  const quotes: string[] = [];

  for (const re of BANNED) if (re.test(all)) problems.push(`Remove the phrase matching ${re.source.replace(/\\b/g, '')}; it reads as machine-written.`);
  for (const re of FORBIDDEN_NAMES) if (re.test(all)) problems.push(`Remove the name matching ${re.source}.`);

  // stray competitor names (only those the card plants are allowed)
  const plantedText = normalize(card.insights.map((i) => `${i.quote} ${i.summary}`).join(' ') + ' ' + card.brief);
  const normAll = normalize(all);
  for (const comp of COMPETITORS) {
    const re = new RegExp(`\\b${comp}\\b`);
    if (re.test(normAll) && !plantedText.includes(comp)) problems.push(`Do not mention ${comp}; it is not part of this scenario.`);
  }

  // stray feedback outside the planted and verbatim lines
  let residue = all;
  for (const ins of card.insights) if (ins.quote) residue = residue.split(ins.quote).join(' ');
  for (const v of card.verbatim ?? []) residue = residue.split(v).join(' ');
  if (card.quoteMode === 'reported') for (const q of out.quotes ?? []) residue = residue.split(q).join(' ');
  for (const st of STRAY) {
    if (st.re.test(residue) && !card.insights.some(st.allowed)) {
      const m = residue.match(st.re)?.[0] ?? '';
      problems.push(`Remove every mention of ${st.name} (for example "${m.slice(0, 50)}"). That is product feedback this file must not contain.`);
    }
  }

  if (out.kind === 'chaos_chat') {
    const handle = (n: string): string => n.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.');
    card.insights.forEach((ins, n) => {
      if (!ins.speaker || !ins.quote || !card.attendees.some((a) => a.name === ins.speaker)) return;
      const nq = normalize(ins.quote);
      const msg = out.messages.find((m) => normalize(m.text).includes(nq));
      if (msg && msg.user !== handle(ins.speaker) && !msg.text.includes('\n')) problems.push(`Required line ${n + 1} must be posted by ${handle(ins.speaker)}, not ${msg.user}.`);
    });
  }

  if (out.kind === 'transcript') {
    const names = new Set(card.attendees.map((a) => a.name));
    const bad = [...new Set(out.turns.map((t) => t.speaker))].filter((s) => !names.has(s));
    if (bad.length) problems.push(`Speakers must be exactly these full names: ${[...names].join(', ')}. You used: ${bad.join(', ')}.`);
  }

  if (card.quoteMode === 'planted') {
    card.insights.forEach((ins, n) => {
      const nq = normalize(ins.quote);
      if (!normalize(all).includes(nq)) {
        const loc = locateQuote(all, ins.quote, 0.9);
        if (loc) {
          warnings.push(`quote ${n + 1} paraphrased slightly (score ${loc.score.toFixed(2)}); kept planted wording via relocation`);
        } else {
          problems.push(`Required line ${n + 1} is missing or altered. It must appear exactly: "${ins.quote}"`);
        }
      } else if (out.kind === 'transcript' && ins.speaker) {
        const t = findTurn(out.turns, ins.quote);
        if (t && t.speaker !== ins.speaker) problems.push(`Required line ${n + 1} must be said by ${ins.speaker}, not ${t.speaker}.`);
      }
      quotes.push(ins.quote);
    });
  } else if (card.insights.length) {
    const qs = out.quotes ?? [];
    if (qs.length !== card.insights.length) problems.push(`"quotes" must have exactly ${card.insights.length} entries, one per feedback item.`);
    card.insights.forEach((ins, n) => {
      const q = qs[n] ?? '';
      const wc = q.split(/\s+/).filter(Boolean).length;
      const loc = q ? locateQuote(all, q, 0.92) : null;
      if (!q || wc < 5) problems.push(`quotes[${n}] must be a full sentence from your text (8-35 words).`);
      else if (!loc) problems.push(`quotes[${n}] ("${q.slice(0, 60)}...") is not copied exactly from your text.`);
      else {
        quotes.push(loc.text);
        if (out.kind === 'transcript' && ins.speaker) {
          const t = findTurn(out.turns, loc.text);
          if (t && t.speaker !== ins.speaker) warnings.push(`quote ${n + 1} said by ${t.speaker} (card said ${ins.speaker})`);
        }
      }
    });
  }

  for (const v of card.verbatim ?? []) if (!all.includes(v)) problems.push(`This exact line is missing or altered: "${v}"`);
  if (card.quoteMode === 'planted' && card.kind !== 'chaos_dump' && card.kind !== 'chaos_chat') {
    const na = normalize(all);
    card.insights.forEach((ins, n) => {
      const nq = normalize(ins.quote);
      if (nq && na.split(nq).length - 1 > 1) problems.push(`Required line ${n + 1} appears more than once. Keep it in exactly one place${card.kind === 'notes_md' ? ' (the ## Product feedback section)' : ''} and delete or reword every other copy, including in the Summary and Discussion.`);
    });
  }
  if (card.quoteMode === 'planted') {
    card.insights.forEach((ins, n) => {
      const i = all.indexOf(ins.quote);
      if (i > 0 && card.kind === 'notes_md' && /["“]/.test(all[i - 1] ?? '')) problems.push(`Do not put quotation marks around required line ${n + 1}; write it as plain text.`);
      if (i > 0 && card.kind === 'notes_md' && /(\w+):\s*["“]?$/.test(all.slice(Math.max(0, i - 24), i))) problems.push(`Do not prefix required line ${n + 1} with a name and colon; the bullet is just the line itself.`);
    });
  }
  if (card.accountId && card.kind !== 'chaos_chat' && card.kind !== 'chaos_dump') {
    const a = accountById(card.accountId);
    if (all.includes(`${Math.round(a.arrUsd / 1000)}k ARR`) || all.includes(`${a.seats} seats`)) problems.push('Do not copy the account background facts (ARR, seat count) into the file.');
  }
  if (out.kind === 'notes_md' && !/^## Next steps/m.test(out.markdown)) problems.push('The notes must end with a complete "## Next steps" section.');

  const words = all.split(/\s+/).filter(Boolean).length;
  if (card.targetWords && words < card.targetWords * 0.55) problems.push(`Too short: about ${words} words; write about ${card.targetWords}.`);
  if (card.targetWords && words > card.targetWords * 1.9) warnings.push(`long: ${words} words vs target ${card.targetWords}`);
  return { problems, quotes, warnings };
}

// ------------------------------------------------------------------ run

const AUDIT_SYSTEM = `You review documents from a synthetic dataset of conversations between Invoca and its customers. Find product feedback that is NOT in the planted list.
Product feedback is something an Invoca product team would log: a bug or defect in an Invoca product or integration, a request for a capability, a pricing or packaging objection, a named competitor pitching or being considered, a risk that the customer will not renew or will cut scope, or specific praise of an Invoca capability.
Not feedback: logistics, small talk, account numbers, the customer's own internal issues, generic politeness ("it's fine", "thanks", "works well"), Invoca staff describing what they will do, and any detail, follow-up, restatement or consequence of a planted item.
Be strict: flag only clear, specific feedback a product manager would want routed. Return JSON {"extras": [{"type": "bug|feature_request|pricing_objection|competitor_mention|churn_risk|praise", "product_area": "call_tracking|signal_ai|presense|integrations|quality_management|ai_agents|billing_pricing|platform", "severity": "low|medium|high|critical", "quote": "<one exact sentence copied from the document>", "reason": "<a few words>"}]}, or {"extras": []} when there is nothing extra.`;

const AuditOut = z.object({
  extras: z.array(
    z.object({
      type: z.enum(['feature_request', 'bug', 'pricing_objection', 'competitor_mention', 'churn_risk', 'praise']),
      product_area: z.enum(['call_tracking', 'signal_ai', 'presense', 'integrations', 'quality_management', 'ai_agents', 'billing_pricing', 'platform']),
      severity: z.enum(['low', 'medium', 'high', 'critical']).catch('medium'),
      quote: z.string(),
      reason: z.string().optional(),
    }),
  ),
});

export type Extra = {
  type: Card['insights'][number]['type'];
  productArea: Card['insights'][number]['productArea'];
  severity: Card['insights'][number]['severity'];
  summary: string;
  quote: string;
};

function stripFence(s: string): string {
  return s.trim().replace(/^```(json)?\s*/, '').replace(/\s*```$/, '');
}

async function audit(card: Card, out: GenOutput, quotes: string[], tag: string): Promise<Extra[]> {
  const doc = textOf(out);
  const planted = card.insights.map((i, n) => `${n + 1}. ${i.type} / ${i.productArea}: ${i.summary} Line: "${quotes[n] ?? i.quote}"`).join('\n') || '(none: this file should contain no product feedback)';
  const res = await chatJson({ system: AUDIT_SYSTEM, user: `PLANTED ITEMS:\n${planted}\n\nDOCUMENT:\n<<<\n${doc}\n>>>`, maxTokens: 900, temperature: 0, tag });
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(res.content));
  } catch {
    return [];
  }
  const p = AuditOut.safeParse(parsed);
  if (!p.success) return [];
  const extras: Extra[] = [];
  for (const e of p.data.extras) {
    const loc = locateQuote(doc, e.quote, 0.9);
    if (!loc) continue; // auditor misquoted; ignore
    const nl = normalize(loc.text);
    if (quotes.some((q) => nl.includes(normalize(q)) || normalize(q).includes(nl))) continue; // a planted line
    extras.push({ type: e.type, productArea: e.product_area, severity: e.severity, summary: e.reason ?? '', quote: loc.text });
  }
  return extras;
}

export async function generateCard(card: Card): Promise<GenRecord> {
  const file = join(GEN_DIR, `${card.fileId}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as GenRecord;
  if (card.handAuthored) {
    const v = validate(card, card.handAuthored);
    if (v.problems.length) throw new Error(`${card.fileId} hand-authored content fails validation: ${v.problems.join(' | ')}`);
    const rec: GenRecord = { fileId: card.fileId, output: card.handAuthored, quotes: v.quotes, attempts: 0, warnings: v.warnings, extras: [] };
    writeFileSync(file, JSON.stringify(rec, null, 2));
    return rec;
  }
  const schema = SCHEMAS[card.kind];
  let feedback: string[] = [];
  let best: GenRecord | null = null;
  const maxTokens = Math.max(3200, Math.round(card.targetWords * 2.8) + 1400);
  const salt = process.env.GEN_SALT ? `.${process.env.GEN_SALT}` : '';
  const MAX = 5;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    const user = buildUserPrompt(card, feedback);
    const res = await chatJson({ system: SYSTEM_PROMPT, user, maxTokens, tag: `${card.fileId}.a${attempt}${salt}`, temperature: card.featured ? 0.8 : 0.9 });
    if (res.truncated) {
      feedback = [`Your output was cut off. Keep the whole file to about ${card.targetWords} words.`];
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFence(res.content));
    } catch {
      feedback = ['Your output was not valid JSON. Return only the JSON object.'];
      continue;
    }
    const sp = schema.safeParse(parsed);
    if (!sp.success) {
      feedback = [`Your JSON did not match the required shape: ${sp.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`];
      continue;
    }
    const out = sanitize({ kind: card.kind, ...(sp.data as object) } as GenOutput);
    const v = validate(card, out);
    if (v.problems.length) {
      feedback = v.problems;
      continue;
    }
    const extras = await audit(card, out, v.quotes, `${card.fileId}.audit${attempt}${salt}`);
    const rec: GenRecord = { fileId: card.fileId, output: out, quotes: v.quotes, attempts: attempt, warnings: v.warnings, extras };
    if (!best || extras.length < (best.extras?.length ?? 99)) best = rec;
    if (extras.length === 0) break;
    feedback = [`Remove this additional product feedback, which is not part of the scenario, and keep everything else: ${extras.map((e) => `"${e.quote}"`).join(' ; ')}`];
  }
  if (!best) throw new Error(`${card.fileId}: generation failed after ${MAX} attempts: ${feedback.join(' | ')}`);
  if (best.extras?.length) best.warnings.push(`audit extras kept: ${best.extras.map((e) => `${e.type}: "${e.quote.slice(0, 70)}"`).join(' ; ')}`);
  writeFileSync(file, JSON.stringify(best, null, 2));
  return best;
}

if (import.meta.main) {
  mkdirSync(GEN_DIR, { recursive: true });
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] ?? '').split(',')) : null;
  const concIdx = args.indexOf('--concurrency');
  const conc = concIdx >= 0 ? Number(args[concIdx + 1]) : 8;
  let cards = allCards().filter((c) => !c.duplicateOf);
  if (args.includes('--featured')) cards = cards.filter((c) => c.featured);
  if (args.includes('--backfill')) cards = cards.filter((c) => !c.featured);
  if (only) cards = cards.filter((c) => only.has(c.fileId));
  const limIdx = args.indexOf('--limit');
  if (limIdx >= 0) cards = cards.slice(0, Number(args[limIdx + 1]));
  const start = spentUsd();
  let done = 0;
  const failures: string[] = [];
  await pool(cards, conc, async (card) => {
    try {
      const rec = await generateCard(card);
      done++;
      if (rec.attempts > 1 || rec.warnings.length) console.log(`  ${card.fileId}: attempts=${rec.attempts} ${rec.warnings.join('; ')}`);
    } catch (e) {
      failures.push(`${card.fileId}: ${String(e).slice(0, 300)}`);
    }
    if ((done + failures.length) % 20 === 0) console.log(`  … ${done + failures.length}/${cards.length}  spent $${spentUsd().toFixed(4)}`);
  });
  console.log(`generated ${done}/${cards.length}; this run $${(spentUsd() - start).toFixed(4)}, total $${spentUsd().toFixed(4)}`);
  if (failures.length) {
    console.log(`FAILURES (${failures.length}):\n${failures.join('\n')}`);
    process.exitCode = 1;
  }
}
