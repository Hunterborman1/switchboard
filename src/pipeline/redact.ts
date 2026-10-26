/**
 * Redact PII/PHI before anything reaches a model. Regex detectors with validators (Luhn for
 * cards, SSN ranges, NANP phone rules), keyword-anchored PHI (DOB, MRN, patient names),
 * street addresses, and person names from speaker labels, known-name lists, honorifics and
 * a conservative first-name list. Tokens are reversible ([PERSON_1] …) and consistent across
 * the document; the originals stay in a server-side vault.
 *
 * Deliberately conservative on names: no capitalised-word heuristics, so product and
 * company names (Signal AI, PreSense, Google Ads, CallRail, Genesys) are never touched.
 */
import type { Redaction, Turn } from '../shared/contracts.ts';
import type { RawTurn, RedactedDoc } from './types.ts';

type Kind = Redaction['kind'];
const TOKEN_PREFIX: Record<Kind, string> = {
  person: 'PERSON', patient: 'PATIENT', phone: 'PHONE', email: 'EMAIL', card: 'CARD', ssn: 'SSN', dob: 'DOB', mrn: 'MRN', address: 'ADDRESS',
};
/** Higher wins when spans overlap at the same start. */
const PRIORITY: Record<Kind, number> = { email: 9, card: 8, ssn: 8, mrn: 7, dob: 7, phone: 6, address: 5, patient: 4, person: 3 };

export type RedactOptions = {
  /** Full names that are always people (Invoca staff, account contacts). */
  knownNames?: string[];
  /** Org/product names that must never be treated as people. */
  safeTerms?: string[];
  /**
   * Also match lower-case first names ("amanda wants…"). Only for chat exports, where people
   * type names in lower case; ambiguous ones that are everyday words (frank, miles, rob…) are skipped.
   */
  lowercaseFirstNames?: boolean;
};

type Span = { start: number; end: number; kind: Kind; value: string };

// Common US first names, excluding ones that are also everyday words (Will, Mark, May, Bill, Grant, Joy…).
const FIRST_NAMES = new Set(
  (
    'Aaron Abby Adam Adrian Aisha Alan Albert Alejandro Alex Alexa Alexis Alice Alicia Alison Allison Alyssa Amanda Amber Amy Ana Andre Andrea Andres Andrew Andy Angela Anita Ann Anna Anne Anthony Antonio Arjun Ashley ' +
    'Barbara Becky Ben Benjamin Beth Betty Blake Bob Bobby Brad Bradley Brandon Brenda Brent Brian Brianna Britney Brittany Bruce Bryan Caleb Cameron Camila Carl Carla Carlos Carmen Carol Caroline Carrie Casey Catherine Chad Charles Charlie Charlotte Chelsea Cheryl Chris Christina Christine Christopher Cindy Claire Clara Cody Colin Connor Courtney Craig Crystal Cynthia ' +
    'Dale Dan Dana Daniel Danielle Danny Darius Darren Dave David Deb Debbie Deborah Denise Dennis Derek Devin Diana Diane Diego Dmitri Donald Donna Doug Douglas Dylan Eddie Eduardo Edward Elena Eli Elijah Elizabeth Ella Ellen Emily Emma Eric Erica Erik Erin Ethan Eva Evan Evelyn ' +
    'Fatima Felipe Frank Gabriel Gabriela Gary George Gina Glen Gloria Greg Gregory Hannah Harold Heather Helen Henry Holly Ian Isaac Isabel Isabella Jack Jacob Jake James Jamie Jane Janet Jared Jasmine Jason Javier Jeff Jeffrey Jen Jenna Jennifer Jenny Jeremy Jerry Jesse Jessica Jill Jim Jimmy Joan Joe Joel John Johnny Jon Jonathan Jordan Jorge Jose Joseph Josh Joshua Juan Judy Julia Julie Justin ' +
    'Kaitlyn Karen Kate Katherine Kathleen Kathy Katie Kayla Keith Kelly Ken Kenneth Kevin Kim Kimberly Kris Kristen Kyle Laura Lauren Leah Leo Leon Leslie Linda Lindsay Lisa Logan Lori Lucas Lucia Luis Luke Lydia Lynn ' +
    'Madison Maria Mariana Marie Marisol Marcus Marilyn Mario Marissa Martha Martin Mary Matt Matthew Megan Melanie Melissa Meredith Michael Michelle Miguel Mike Miles Mohammed Molly Monica Morgan Nancy Natalie Nathan Neil Nicholas Nick Nicole Nina Noah Nora Olivia Omar Oscar Owen ' +
    'Pablo Pam Pamela Patricia Patrick Paul Paula Peter Phil Philip Priya Rachel Rahul Raj Ramon Randy Raymond Rebecca Renee Ricardo Richard Rick Rita Rob Robert Roberto Robin Rodrigo Ron Ronald Rosa Ryan ' +
    'Sam Samantha Samuel Sandra Sanjay Sara Sarah Scott Sean Sergio Shannon Sharon Shawn Sheila Shirley Sofia Sophia Stacy Stephanie Stephen Steve Steven Susan Tanya Tara Teresa Terry Theresa Thomas Tiffany Tim Timothy Tina Todd Tom Tony Tracy Travis Trevor Tyler Valerie Vanessa Veronica Victor Victoria Vikram Vince Vincent Walter Wayne Wendy Whitney William Xavier Yolanda Zach Zachary Zoe'
  ).split(' '),
);

/**
 * Everyday words that are never a name on their own, whatever their case: function words, and
 * the field labels of forms, surveys and notes ("Role:", "NPS:", "Comment:") that a parser can
 * mistake for a speaker. Guards speaker-label names, name aliases and the lower-case matcher.
 */
export const STOPWORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just last let me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours ' +
    'yes ok okay thanks thank hi hey hello please sorry today tomorrow yesterday next first second third new old one two three half per via vs re fwd fyi cc bcc ' +
    'role roles nps csat score scores rating ratings comment comments response responses respondent answer answers question questions feedback note notes summary subject title date time status priority owner action actions item items issue issues topic topics agenda update updates recap followup follow todo task tasks name names email phone address company account location region department team tier plan seats renewal source type area severity reason result results outcome outcomes value values total count'
  ).split(' '),
);
/** Lower-case first names that are also everyday words; the lower-case matcher never takes these. */
const AMBIGUOUS_LOWER = new Set(
  'amber bob carol chad dan charlotte clara crystal dale frank glen gloria heather holly jack jasmine jordan josh ken kim leo lynn madison miles nick nina oscar pat peter rob robin rosa terry victoria ella sandy ginger rose faith hope eve dawn joy art bill grant sue chase gene ray max june april ash guy don jean ivy iris lily daisy sage angel august page drew hunter wade rich penny lee'.split(' '),
);
/** Name-shaped word: starts upper-case and has a lower-case letter ("Dana", "O'Brien", "McAllister", "Lee-Ann"). */
const NAME_WORD = /^[A-Z][A-Za-z'’]*[a-z][A-Za-z'’]*(?:-[A-Z][A-Za-z'’]*)?$/;
const NAME_PARTICLE = new Set(['de', 'del', 'della', 'da', 'di', 'van', 'von', 'der', 'den', 'la', 'le', 'du', 'bin', 'al']);
const HANDLE = /^@?[A-Za-z][A-Za-z0-9]*(?:[._][A-Za-z0-9]+)+$/;

const COMMON_CAPS = new Set(['I', 'The', 'And', 'But', 'So', 'Yes', 'No', 'Ok', 'Okay', 'Thanks', 'Thank', 'Hi', 'Hey', 'Hello', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Team', 'From', 'To', 'Re', 'We', 'You', 'He', 'She', 'They', 'It', 'This', 'That', 'Our', 'If', 'When', 'Then', 'Also', 'Just', 'Can', 'Will', 'Said', 'Says', 'Asked', 'Mentioned', 'Called', 'Is', 'Was', 'On', 'In', 'At', 'For', 'With', 'Not', 'Customer', 'Support', 'Sales', 'Notes', 'Action', 'Next', 'Signal', 'Call', 'Calls', 'Google', 'Invoca']);
const GENERIC_LABEL = /^(speaker|spk|spkr|customer|client|csm|agent|rep|host|guest|unknown|participant|caller|interviewer|moderator|notes?|csm notes|me|us|them|team|everyone|all|support|sales|bot|system|operator|ivr|document|section|slide|page)\b/i;
const NOT_A_NAME = new Set([
  'portal', 'intake', 'data', 'records', 'record', 'experience', 'calls', 'call', 'line', 'lines', 'info', 'information', 'volume', 'privacy', 'safety', 'care', 'satisfaction',
  'scheduling', 'appointments', 'appointment', 'flow', 'journey', 'access', 'outcomes', 'portal.', 'reminders', 'reminder', 'charts', 'chart', 'notes', 'side', 'facing', 'level',
  'the', 'a', 'an', 'and', 'or', 'is', 'was', 'has', 'had', 'with', 'who', 'that', 'this', 'our', 'their', 'his', 'her', 'id', 'name', 'number',
]);

// ------------------------------------------------------------------ validators

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

export function ssnValid(s: string): boolean {
  const d = s.replace(/\D/g, '');
  if (d.length !== 9) return false;
  const area = d.slice(0, 3);
  if (area === '000' || area === '666' || area[0] === '9') return false;
  if (d.slice(3, 5) === '00' || d.slice(5) === '0000') return false;
  return true;
}

function phoneValid(s: string): boolean {
  const d = s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (d.length !== 10) return false;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d);
}

// ------------------------------------------------------------------ detectors

const MONTHS = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const DATE = String.raw`(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:${MONTHS})\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}\s+(?:${MONTHS})\s+\d{4})`;
const STREET = 'Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Terrace|Ter|Parkway|Pkwy|Circle|Cir|Highway|Hwy|Trail|Trl';
const STREET_WORD = new RegExp(`^(?:${STREET})\\.?$`);
const NAME = String.raw`[A-Z][a-z'’]+(?:-[A-Z][a-z]+)?`;
/** Capitalised words that start a new clause after an address, never a city. */
const CITY_STOP = 'And|But|So|Then|The|That|This|She|He|They|We|I|It|Which|Who|Also|Apt|Apartment|Suite|Ste|Unit';

const RE = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g,
  phone: /(?<![\w-])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w-])/g,
  phoneBare: /(?<![\w-])(?:phone|cell|mobile|callback|call back|reach (?:me|him|her) at|number is|tel)[:\s]+(\d{10})(?!\d)/gi,
  card: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
  ssn: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g,
  ssnKeyword: /\b(?:SSN|social security(?: number)?|social)\s*(?:#|no\.?|number)?\s*[:\-]?\s*(\d{3}[ -]?\d{2}[ -]?\d{4})(?!\d)/gi,
  dob: new RegExp(String.raw`\b(?:DOB|D\.O\.B\.?|date of birth|birth ?date|born(?: on)?|birthday(?: is)?)\s*(?:is|was|of)?\s*[:\-]?\s*(${DATE})`, 'gi'),
  mrn: /\b(?:MRN|medical record(?: number| no\.?| #)?|chart(?: number| #)|patient (?:id|ID|number|#)|member (?:id|ID|number|#))\s*(?:is|was)?\s*[:#]?\s*([A-Z]{0,4}[-]?\d[\dA-Z-]{3,14})\b/g,
  // A street address, plus the city / state / ZIP that follow it ("2218 Belmont Boulevard, Nashville,
  // TN 37212"): below-state geography is an identifier under HIPAA Safe Harbor. A city on its own
  // (an account's HQ) is business context and is left alone.
  address: new RegExp(
    String.raw`\b\d{1,6}\s+(?:[NSEW]\.?\s+)?(?:${NAME}\s+){0,3}(?:${STREET})\b\.?(?:,?\s+(?:Apt|Apartment|Suite|Ste|Unit|#)\.?\s*[\w-]+)?(?:,\s*(?!(?:${CITY_STOP})\b)${NAME}(?:\s+(?!(?:${CITY_STOP})\b)${NAME}){0,2}(?:,?\s+[A-Z]{2}\b)?(?:\s+\d{5}(?:-\d{4})?)?)?`,
    'g',
  ),
  patient: new RegExp(String.raw`\b(?:[Pp]atient|[Pp]t\.|[Mm]ember|[Tt]he patient's name is|[Pp]atient name)\s*(?:name)?\s*[:\-]?\s+(${NAME}(?:\s+${NAME})?)`, 'g'),
  honorific: new RegExp(String.raw`\b(?:Mr|Mrs|Ms|Mx|Miss|Dr|Prof)\.?\s+(${NAME}(?:\s+${NAME})?)`, 'g'),
  intro: new RegExp(String.raw`\b(?:my name is|my name's|name's|this is|I'm|I am|speaking with|spoke with|talked to|talking to|cc'?ing|cc|loop(?:ing)? in|ask|asked|per)\s+(${NAME}(?:\s+${NAME})?)\b`, 'g'),
};

function collect(text: string, re: RegExp, kind: Kind, group = 0, validate?: (v: string) => boolean): Span[] {
  const out: Span[] = [];
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    const value = m[group];
    if (!value) continue;
    const offset = group === 0 ? 0 : m[0].indexOf(value);
    const start = (m.index ?? 0) + offset;
    if (validate && !validate(value)) continue;
    out.push({ start, end: start + value.length, kind, value });
  }
  return out;
}

function trimName(value: string, safe: Set<string>): string | null {
  const words = value.split(/\s+/);
  while (words.length && (NOT_A_NAME.has(words[words.length - 1]!.toLowerCase()) || safe.has(words[words.length - 1]!.toLowerCase()))) words.pop();
  if (!words.length || NOT_A_NAME.has(words[0]!.toLowerCase()) || safe.has(words[0]!.toLowerCase())) return null;
  return words.join(' ');
}

/** Pattern-based spans in one string (everything except list/alias name matching). */
export function detectPatterns(text: string, safe: Set<string> = new Set()): Span[] {
  const spans: Span[] = [
    ...collect(text, RE.email, 'email'),
    ...collect(text, RE.ssn, 'ssn', 0, ssnValid),
    ...collect(text, RE.ssnKeyword, 'ssn', 1, ssnValid),
    ...collect(text, RE.card, 'card', 0, (v) => luhnValid(v.replace(/\D/g, ''))),
    ...collect(text, RE.phone, 'phone', 0, phoneValid),
    ...collect(text, RE.phoneBare, 'phone', 1, phoneValid),
    ...collect(text, RE.dob, 'dob', 1),
    ...collect(text, RE.mrn, 'mrn', 1),
    ...collect(text, RE.address, 'address'),
  ];
  for (const s of collect(text, RE.patient, 'patient', 1)) {
    const v = trimName(s.value, safe);
    if (v) spans.push({ ...s, value: v, end: s.start + v.length });
  }
  for (const s of collect(text, RE.honorific, 'person', 1)) {
    const v = trimName(s.value, safe);
    if (v) spans.push({ ...s, value: v, end: s.start + v.length });
  }
  // Intro patterns ("ask Jordan", "this is Dana") only count when the first word is a known first name.
  for (const s of collect(text, RE.intro, 'person', 1)) {
    const v = trimName(s.value, safe);
    if (v && FIRST_NAMES.has(v.split(' ')[0]!)) spans.push({ ...s, value: v, end: s.start + v.length });
  }
  return spans;
}

/**
 * A speaker label is only a name when it is shaped like one: a chat handle ("diego.alvarez"), a
 * listed first name in any case ("cody"), or name-shaped words with no everyday word among them.
 * This keeps note headings and form fields ("Half-remembered from last call:", "Role:", "NPS:",
 * "GM comparison:") from becoming people, and their words from becoming name aliases.
 */
function speakerLooksLikeName(words: string[]): boolean {
  if (words.length === 1) {
    const w = words[0]!;
    if (HANDLE.test(w)) return !w.replace(/^@/, '').split(/[._]/).some((p) => STOPWORDS.has(p.toLowerCase()));
    if (STOPWORDS.has(w.toLowerCase())) return false;
    if (FIRST_NAMES.has(w[0]!.toUpperCase() + w.slice(1).toLowerCase())) return true;
    return NAME_WORD.test(w);
  }
  return words.every((w, i) => (i > 0 && NAME_PARTICLE.has(w)) || (NAME_WORD.test(w) && !STOPWORDS.has(w.toLowerCase())));
}

/** Names from speaker labels: "Dana Whitfield (Brightline)" → "Dana Whitfield"; "dana.w" → "dana.w". */
export function namesFromSpeakers(speakers: string[], safe: Set<string> = new Set()): string[] {
  const out = new Set<string>();
  for (const label of speakers) {
    let l = label.replace(/\(.*?\)/g, '').replace(/<[^>]*>/g, '').replace(/[,|].*$/, '').replace(/\s+-\s+.*$/, '').trim();
    l = l.replace(/^(?:Mr|Mrs|Ms|Mx|Miss|Dr|Prof)\.?\s+/, '');
    if (!l || l.length < 2 || GENERIC_LABEL.test(l) || /\d/.test(l) || /@/.test(l)) continue;
    if (safe.has(l.toLowerCase())) continue;
    const words = l.split(/\s+/);
    if (words.length > 4 || words.some((w) => safe.has(w.toLowerCase()))) continue;
    if (!speakerLooksLikeName(words)) continue;
    out.add(l);
  }
  return [...out];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mask(kind: Kind, value: string): string {
  const dot = (w: string) => (w.length <= 1 ? w : `${w[0]}${'•'.repeat(Math.min(5, w.length - 1))}`);
  switch (kind) {
    case 'person':
    case 'patient':
      return value.split(/[\s.]+/).filter(Boolean).map(dot).join(' ');
    case 'email': {
      const [u, d] = value.split('@');
      const parts = (d ?? '').split('.');
      return `${dot(u ?? '')}@${dot(parts[0] ?? '')}.${parts.slice(1).join('.')}`;
    }
    case 'phone': {
      const digits = value.replace(/\D/g, '');
      return `(•••) •••-${digits.slice(-2).padStart(4, '•')}`;
    }
    case 'card':
      return `•••• •••• •••• ${value.replace(/\D/g, '').slice(-4)}`;
    case 'ssn':
      return '•••-••-••••';
    case 'dob':
      return '••/••/••••';
    case 'mrn':
      return `${value.slice(0, 1)}${'•'.repeat(Math.max(3, value.length - 1))}`;
    case 'address': {
      // The street type only ("••• Boulevard"), never the street name or the city.
      const suffix = value.split(/[\s,]+/).find((w) => STREET_WORD.test(w));
      return `${'•'.repeat(3)} ${suffix ?? ''}`.trim();
    }
  }
}

type Entity = { token: string; kind: Kind; value: string; count: number; labelSeen?: boolean };

/**
 * Redact every turn (text and speaker label) with one consistent token table.
 * Returns the redacted document (turn texts joined with "\n") and per-turn char offsets.
 */
export function redactDocument(turns: RawTurn[], opts: RedactOptions = {}): RedactedDoc {
  const safe = new Set((opts.safeTerms ?? []).flatMap((t) => [t.toLowerCase(), ...t.toLowerCase().split(/\s+/)]).filter((t) => t.length >= 3));
  for (const s of ['invoca', 'signal', 'presense', 'google', 'salesforce', 'genesys', 'five9', 'adobe', 'callrail', 'marchex', 'gong', 'meta', 'nice', 'callrail', 'whatconverts', 'calltrackingmetrics']) safe.add(s);

  // ---- pass 1: discover entities across the whole document
  const entities = new Map<string, Entity>(); // key kind-agnostic for names: lowercased value
  const counters: Partial<Record<Kind, number>> = {};
  const keyOf = (kind: Kind, value: string) => (kind === 'person' || kind === 'patient' ? `name:${value.toLowerCase()}` : `${kind}:${value.replace(/\s+/g, ' ').toLowerCase()}`);
  const register = (kind: Kind, value: string): Entity => {
    const key = keyOf(kind, value);
    const existing = entities.get(key);
    if (existing) {
      if (kind === 'patient' && existing.kind === 'person') existing.kind = 'patient'; // promote; token reassigned below
      return existing;
    }
    const e: Entity = { token: '', kind, value, count: 0 };
    entities.set(key, e);
    return e;
  };

  const speakerNames = namesFromSpeakers([...new Set(turns.map((t) => t.speaker))], safe);
  for (const n of [...speakerNames, ...(opts.knownNames ?? [])]) register('person', n);
  for (const t of turns) for (const s of detectPatterns(`${t.speaker}\n${t.text}`, safe)) register(s.kind, s.value);
  // A handle label ("diego.alvarez", "diego_alvarez") and the known full name are one person.
  for (const [k, e] of [...entities.entries()]) {
    if (!k.startsWith('name:') || !/[._]/.test(k)) continue;
    const other = entities.get(`name:${k.slice(5).replace(/[._]+/g, ' ')}`);
    if (other && other !== e) entities.set(k, other);
  }
  // Aliases: first and last names of every multi-word name map to the same entity.
  for (const e of [...entities.values()]) {
    if (e.kind !== 'person' && e.kind !== 'patient') continue;
    const words = e.value.split(/[\s.]+/).filter((w) => w.length >= 3 && !safe.has(w.toLowerCase()) && !NOT_A_NAME.has(w.toLowerCase()) && !STOPWORDS.has(w.toLowerCase()) && !NAME_PARTICLE.has(w.toLowerCase()));
    if (words.length < 2) continue;
    for (const w of words) if (!entities.has(`name:${w.toLowerCase()}`)) entities.set(`name:${w.toLowerCase()}`, e);
  }
  // Tokens are assigned on first use (below), so numbering follows the document.

  // Literal name matchers (longest first), case-insensitive for discovered names; first-name
  // list matches only capitalised words.
  const nameKeys = [...entities.entries()].filter(([k]) => k.startsWith('name:')).map(([k, e]) => ({ text: k.slice(5), e }));
  nameKeys.sort((a, b) => b.text.length - a.text.length);
  const nameRe = nameKeys.length ? new RegExp(`(?<![\\w@.])(?:${nameKeys.map((n) => escapeRe(n.text).replace(/\s+/g, '\\s+')).join('|')})(?![\\w@])`, 'gi') : null;
  // Chat handles: "diego.alvarez", "@diego.alvarez", "diego_alvarez", "dana.w". A handle is
  // masked whole when any part is a known name (or a listed first name), never half.
  const handleRe = /(?<![\w.@/-])@?[A-Za-z][A-Za-z0-9]*(?:[._][A-Za-z0-9]+)+(?![\w@-])/g;
  const handleEntity = (raw: string): Entity | null => {
    const bare = raw.replace(/^@/, '').toLowerCase();
    const parts = bare.split(/[._]/);
    if (parts.some((p) => safe.has(p) || NOT_A_NAME.has(p))) return null;
    const known = entities.get(`name:${bare}`) ?? parts.filter((p) => p.length >= 3).map((p) => entities.get(`name:${p}`)).find((e) => e && (e.kind === 'person' || e.kind === 'patient'));
    let e = known ?? null;
    if (!e) {
      const listed = parts.some((p) => p.length >= 3 && FIRST_NAMES.has(p[0]!.toUpperCase() + p.slice(1)));
      if (!listed) return null;
      e = register('person', raw.replace(/^@/, ''));
    }
    if (!entities.has(`name:${bare}`)) entities.set(`name:${bare}`, e);
    return e;
  };
  // Chat exports: lower-case first names in message text ("amanda wants…").
  const lowerFirstRe = opts.lowercaseFirstNames ? /(?<![\w@.#/-])([a-z]{3,})(?![\w@-])/g : null;
  // The surname is a lookahead so "Later Kevin Brooks" still finds "Kevin Brooks".
  const firstNameRe = /\b([A-Z][a-z]+)\b(?=(\s+[A-Z][a-z'’]+(?:-[A-Z][a-z]+)?\b)?)/g;

  const redactString = (s: string, countIt = true): string => {
    const spans: (Span & { e: Entity })[] = [];
    for (const p of detectPatterns(s, safe)) {
      const e = entities.get(keyOf(p.kind, p.value)) ?? register(p.kind, p.value);
      spans.push({ ...p, e });
    }
    for (const m of s.matchAll(handleRe)) {
      if (/@/.test(s.slice(m.index! + m[0].length, m.index! + m[0].length + 1))) continue; // an email's local part
      const e = handleEntity(m[0]);
      if (e) spans.push({ start: m.index!, end: m.index! + m[0].length, kind: e.kind, value: m[0], e });
    }
    if (nameRe) {
      for (const m of s.matchAll(nameRe)) {
        const e = entities.get(`name:${m[0].replace(/\s+/g, ' ').toLowerCase()}`);
        if (e) spans.push({ start: m.index!, end: m.index! + m[0].length, kind: e.kind, value: m[0], e });
      }
    }
    for (const m of s.matchAll(firstNameRe)) {
      const first = m[1]!;
      if (!FIRST_NAMES.has(first) || safe.has(first.toLowerCase())) continue;
      const last = m[2]?.trim();
      const surname = last && !safe.has(last.toLowerCase()) && !NOT_A_NAME.has(last.toLowerCase()) && !COMMON_CAPS.has(last) ? last : null;
      const value = surname ? `${first} ${surname}` : first;
      let e = entities.get(`name:${value.toLowerCase()}`);
      if (!e) {
        e = entities.get(`name:${first.toLowerCase()}`) ?? register('person', value);
        if (surname && !entities.has(`name:${value.toLowerCase()}`)) entities.set(`name:${value.toLowerCase()}`, e);
        if (!entities.has(`name:${first.toLowerCase()}`)) entities.set(`name:${first.toLowerCase()}`, e);
      }
      spans.push({ start: m.index!, end: m.index! + value.length, kind: e.kind, value, e });
    }
    if (lowerFirstRe) {
      for (const m of s.matchAll(lowerFirstRe)) {
        const w = m[1]!;
        if (AMBIGUOUS_LOWER.has(w) || STOPWORDS.has(w) || safe.has(w) || NOT_A_NAME.has(w)) continue;
        if (!FIRST_NAMES.has(w[0]!.toUpperCase() + w.slice(1))) continue;
        const e = entities.get(`name:${w}`) ?? register('person', w);
        if (!entities.has(`name:${w}`)) entities.set(`name:${w}`, e);
        spans.push({ start: m.index!, end: m.index! + w.length, kind: e.kind, value: w, e });
      }
    }
    if (!spans.length) return s;
    spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || PRIORITY[b.kind] - PRIORITY[a.kind]);
    let out = '';
    let pos = 0;
    for (const sp of spans) {
      if (sp.start < pos) continue; // overlapped by an earlier, longer span
      if (!sp.e.token) {
        counters[sp.e.kind] = (counters[sp.e.kind] ?? 0) + 1;
        sp.e.token = `[${TOKEN_PREFIX[sp.e.kind]}_${counters[sp.e.kind]}]`;
      }
      out += s.slice(pos, sp.start) + sp.e.token;
      if (countIt) sp.e.count++;
      else sp.e.labelSeen = true;
      pos = sp.end;
    }
    return out + s.slice(pos);
  };

  const labelCache = new Map<string, string>();
  const outTurns: Turn[] = [];
  let text = '';
  for (const t of turns) {
    const red = redactString(t.text);
    // Speaker labels repeat on every turn; count each distinct label once.
    let speaker = labelCache.get(t.speaker);
    if (speaker === undefined) {
      speaker = t.speaker === 'unknown' ? t.speaker : redactString(t.speaker);
      labelCache.set(t.speaker, speaker);
    }
    if (text) text += '\n';
    const start = text.length;
    text += red;
    outTurns.push({ id: t.id, speaker, role: t.role, ts: t.ts, text: red, start, end: text.length });
  }

  const vault: Record<string, string> = {};
  const redactions: Redaction[] = [];
  for (const e of new Set(entities.values())) {
    if ((!e.count && !e.labelSeen) || !e.token) continue;
    vault[e.token] = e.value;
    redactions.push({ token: e.token, kind: e.kind, preview: mask(e.kind, e.value), count: e.count + (e.labelSeen ? 1 : 0) });
  }
  redactions.sort((a, b) => a.kind.localeCompare(b.kind) || a.token.localeCompare(b.token, undefined, { numeric: true }));
  return { text, turns: outTurns, redactions, vault };
}

export function redactionSummary(redactions: Redaction[]): string {
  if (!redactions.length) return 'No personal data found';
  const total = redactions.reduce((s, r) => s + r.count, 0);
  const by = new Map<string, number>();
  const label: Record<Kind, string> = { person: 'name', patient: 'patient', phone: 'phone', email: 'email', card: 'card', ssn: 'SSN', dob: 'date of birth', mrn: 'MRN', address: 'address' };
  for (const r of redactions) by.set(label[r.kind], (by.get(label[r.kind]) ?? 0) + r.count);
  const phi = redactions.filter((r) => ['patient', 'dob', 'mrn', 'ssn'].includes(r.kind)).reduce((s, r) => s + r.count, 0);
  const parts = [...by.entries()].map(([k, n]) => `${n} ${k}${n === 1 ? '' : k.endsWith('s') ? '' : 's'}`);
  return `Redacted ${total} value${total === 1 ? '' : 's'} (${parts.join(', ')})${phi ? ` · ${phi} PHI` : ''}`;
}
