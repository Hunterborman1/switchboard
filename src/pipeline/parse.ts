/**
 * Normalize: detect the format (vtt, srt, txt, md, eml, chat, doc) and parse speakers and turns.
 * Robust to messy input: missing speakers, crosstalk markers, timestamp drift, mixed formats,
 * BOMs, CRLF and control characters. Raw JSON exports (Zoom / Gong / Teams-style transcripts,
 * Slack exports, anything else with text in it) are read as JSON. Binary files (PDF, DOCX, PPTX,
 * XLSX, HTML, RTF) arrive as text converted in the browser, with formatHint 'doc'. Output text is
 * the original text (redaction happens next). Any input produces turns; nothing throws.
 */
import type { FileFormat } from '../shared/contracts.ts';
import type { ParsedDoc, RawTurn } from './types.ts';

export type ParseOptions = {
  formatHint?: FileFormat | null;
  /** Names of Invoca staff (people.json): marks their turns role 'invoca'. */
  invocaNames?: string[];
};

const TS = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?`;
const NOT_SPEAKERS = new Set([
  'note', 'notes', 'summary', 'action items', 'action item', 'next steps', 're', 'fw', 'fwd', 'ps', 'p.s', 'subject', 'date', 'to', 'cc',
  'http', 'https', 'mailto', 'agenda', 'attendees', 'update', 'todo', 'tldr', 'tl;dr', 'q', 'a', 'eta', 'fyi', 'context', 'ask', 'asks',
  'risk', 'risks', 'issue', 'issues', 'pain', 'pain points', 'wins', 'blockers', 'decision', 'decisions', 'quote', 'quotes', 'example',
]);

const SRT_HEAD = /^\d+[ \t]*\r?\n[ \t]*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}[ \t]*-->/;

export function detectFormat(filename: string, content: string, hint?: FileFormat | null): FileFormat {
  if (hint) return hint;
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const head = content.replace(/^﻿/, '').trimStart();
  if (ext === 'vtt' || head.startsWith('WEBVTT')) return 'vtt';
  if (ext === 'srt' || SRT_HEAD.test(head)) return 'srt';
  if (/^[[{]/.test(head)) {
    const json = jsonDocument(head);
    if (json) return json.format;
  }
  const firstLines = head.split(/\r?\n/).slice(0, 12);
  const headerCount = firstLines.filter((l) => /^(From|To|Subject|Date|Cc|Sent):\s/i.test(l)).length;
  if (ext === 'eml' || headerCount >= 2) return 'eml';
  if (ext === 'md' || ext === 'markdown') return 'md';
  const lines = head.split(/\r?\n/).filter((l) => l.trim());
  const chatLike = lines.filter((l) => CHAT_PATTERNS.some((re) => re.test(l))).length;
  if (ext === 'chat' || (lines.length >= 3 && chatLike / lines.length >= 0.5)) return 'chat';
  if (/^#{1,3}\s/m.test(head) && lines.filter((l) => /^\s*[-*]\s/.test(l)).length >= 3 && ext !== 'txt') return 'md';
  if (['pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'odt', 'rtf', 'html', 'htm'].includes(ext)) return 'doc';
  return 'txt';
}

/** BOM, CRLF, non-breaking spaces and control characters (binary residue) out; nothing else. */
export function sanitize(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u00A0/g, ' ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
}

/** A turn longer than this is cut on sentence boundaries into pieces of the same speaker. */
const MAX_TURN_CHARS = 4_000;
const PIECE_CHARS = 1_500;

export function splitLongText(text: string, max = PIECE_CHARS): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const slice = rest.slice(0, max);
    const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '));
    const at = cut > max * 0.4 ? cut + 1 : slice.lastIndexOf(' ') > max * 0.4 ? slice.lastIndexOf(' ') : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

export function parseDocument(filename: string, content: string, opts: ParseOptions = {}): ParsedDoc {
  const clean = sanitize(content);
  // Raw JSON is read as JSON whatever the hint says (a converter may pass an export through).
  const json = /^\s*[[{]/.test(clean) ? jsonDocument(clean) : null;
  const format = opts.formatHint ?? json?.format ?? detectFormat(filename, clean);
  const warnings: string[] = [];
  let subject: string | null = null;
  let turns: Omit<RawTurn, 'id' | 'role'>[];
  let prose = false;
  if (json) {
    turns = json.turns;
    prose = json.format === 'doc';
  } else switch (format) {
    case 'vtt':
      turns = parseVtt(clean, warnings);
      break;
    case 'srt':
      turns = parseSrt(clean, warnings);
      break;
    case 'doc': {
      const r = parseDoc(clean);
      turns = r.turns;
      prose = r.prose;
      break;
    }
    case 'eml': {
      const r = parseEml(clean, warnings);
      turns = r.turns;
      subject = r.subject;
      break;
    }
    case 'md':
      turns = parseMd(clean);
      break;
    case 'chat':
      turns = parseChat(clean);
      if (!turns.length) turns = parseTxt(clean);
      break;
    default:
      turns = parseTxt(clean);
  }
  turns = turns.map((t) => ({ ...t, text: t.text.replace(/[ \t]+/g, ' ').trim(), speaker: t.speaker.trim() || 'unknown' })).filter((t) => t.text.length > 0);
  if (!turns.length && clean.trim()) {
    warnings.push('no structure detected; treated as one block');
    turns = [{ speaker: 'unknown', ts: null, text: clean.replace(/\s+/g, ' ').trim() }];
  }
  // Very long turns (a document without paragraph breaks) become pieces of the same speaker.
  if (turns.some((t) => t.text.length > MAX_TURN_CHARS)) turns = turns.flatMap((t) => (t.text.length > MAX_TURN_CHARS ? splitLongText(t.text).map((text) => ({ ...t, text })) : [t]));
  // Prose sections are not people: no roles to infer.
  const withRoles = prose ? turns.map((t) => ({ ...t, role: 'unknown' as const })) : assignRoles(turns, opts.invocaNames ?? []);
  const out: RawTurn[] = withRoles.map((t, i) => ({ id: `t${String(i + 1).padStart(3, '0')}`, speaker: t.speaker, role: t.role, ts: t.ts, text: t.text }));
  const speakers = [...new Set(out.map((t) => t.speaker).filter((s) => s !== 'unknown'))];
  if (out.every((t) => t.speaker === 'unknown') && format !== 'md' && !prose) warnings.push('no speaker labels found');
  if (json) warnings.push(`read as a JSON ${json.shape}`);
  return { format, turns: out, speakers, warnings, subject };
}

// ------------------------------------------------------------------ roles

export function assignRoles<T extends { speaker: string }>(turns: T[], invocaNames: string[]): (T & { role: RawTurn['role'] })[] {
  const staff = invocaNames.flatMap((n) => [n.toLowerCase(), n.split(/\s+/)[0]!.toLowerCase()]).filter((n) => n.length >= 3);
  const isInvoca = (label: string): boolean => {
    const l = label.toLowerCase();
    if (/invoca|\bcsm\b|customer success|account manager|\bae\b|@invoca\.com/.test(l)) return true;
    const name = l.replace(/\(.*?\)/g, '').replace(/<.*?>/g, '').trim();
    return staff.some((s) => name === s || name.startsWith(`${s} `) || name.split(/[\s._-]+/)[0] === s);
  };
  const labels = new Map<string, RawTurn['role']>();
  for (const t of turns) {
    const hint = (t as { roleHint?: RawTurn['role'] }).roleHint;
    if (hint && !labels.has(t.speaker)) labels.set(t.speaker, hint);
    if (labels.has(t.speaker)) continue;
    if (t.speaker === 'unknown' || /^(notes?|csm notes)$/i.test(t.speaker)) labels.set(t.speaker, 'unknown');
    else labels.set(t.speaker, isInvoca(t.speaker) ? 'invoca' : 'unknown');
  }
  const anyInvoca = [...labels.values()].includes('invoca');
  for (const [label, role] of labels) {
    if (role !== 'unknown' || label === 'unknown' || /^(notes?|csm notes)$/i.test(label)) continue;
    if (anyInvoca || /\(.+\)/.test(label) || /@/.test(label) || /customer|client|caller/i.test(label)) labels.set(label, 'customer');
  }
  return turns.map((t) => ({ ...t, role: labels.get(t.speaker) ?? 'unknown' }));
}

// ------------------------------------------------------------------ helpers

function normTs(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const parts = raw.replace(',', '.').split('.')[0]!.split(':').map((p) => p.padStart(2, '0'));
  while (parts.length < 3) parts.unshift('00');
  return parts.slice(-3).join(':');
}

function plausibleSpeaker(label: string): boolean {
  const l = label.trim().replace(/^\*+|\*+$/g, '').trim();
  if (!l || l.length > 48) return false;
  if (NOT_SPEAKERS.has(l.toLowerCase())) return false;
  if (/^(https?|www)/i.test(l)) return false;
  const words = l.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  if (/[.!?]$/.test(l)) return false;
  // "so the thing is" style prose starts lowercase and has several words.
  if (words.length >= 3 && words.every((w) => /^[a-z]/.test(w)) && !/^speaker/i.test(l)) return false;
  return true;
}

const TXT_LINE = new RegExp(String.raw`^\s*(?:\[\s*(${TS})\s*\]|\(\s*(${TS})\s*\)|(${TS}))?\s*[-–—]?\s*([^:\[\]]{1,60}?)\s*:\s+(.*)$`);
const TS_ONLY = new RegExp(String.raw`^\s*(?:\[\s*(${TS})\s*\]|(${TS}))\s+(.*)$`);
const SPEAKER_NO_COLON = new RegExp(String.raw`^\s*(?:\[\s*(${TS})\s*\]|(${TS}))\s+((?:speaker|spk|spkr)[ _]?\d+|SPEAKER_\d+)\s*[-–]?\s*(.*)$`, 'i');

function parseTxt(text: string): Omit<RawTurn, 'id' | 'role'>[] {
  const out: Omit<RawTurn, 'id' | 'role'>[] = [];
  let current: Omit<RawTurn, 'id' | 'role'> | null = null;
  let blank = false;
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      blank = true;
      continue;
    }
    let m = line.match(SPEAKER_NO_COLON);
    if (m) {
      current = { speaker: m[3]!.replace(/_/g, ' ').trim(), ts: normTs(m[1] ?? m[2]), text: m[4] ?? '' };
      out.push(current);
      blank = false;
      continue;
    }
    m = line.match(TXT_LINE);
    if (m && plausibleSpeaker(m[4]!)) {
      current = { speaker: m[4]!.replace(/^\*+|\*+$/g, '').trim(), ts: normTs(m[1] ?? m[2] ?? m[3]), text: m[5] ?? '' };
      out.push(current);
      blank = false;
      continue;
    }
    m = line.match(TS_ONLY);
    if (m) {
      // "[00:01:12] text" with no speaker: a new unknown turn unless it continues the same flow.
      current = { speaker: current && !blank ? current.speaker : 'unknown', ts: normTs(m[1] ?? m[2]), text: m[3] ?? '' };
      out.push(current);
      blank = false;
      continue;
    }
    if (current && !blank) current.text += ` ${line.trim()}`;
    else {
      current = { speaker: current?.speaker && !blank ? current.speaker : 'unknown', ts: null, text: line.trim() };
      out.push(current);
    }
    blank = false;
  }
  return out;
}

// ------------------------------------------------------------------ vtt

function parseVtt(text: string, warnings: string[]): Omit<RawTurn, 'id' | 'role'>[] {
  const blocks = text.split(/\n\s*\n/);
  const out: Omit<RawTurn, 'id' | 'role'>[] = [];
  const timing = /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/;
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0]!)) {
      // A header block may still carry a cue if the file has no blank line after WEBVTT.
      const idx = lines.findIndex((l) => timing.test(l));
      if (idx < 0) continue;
      lines.splice(0, idx);
    }
    const ti = lines.findIndex((l) => timing.test(l));
    let ts: string | null = null;
    let body: string[];
    if (ti >= 0) {
      ts = normTs(lines[ti]!.match(timing)![1]);
      body = lines.slice(ti + 1);
    } else {
      body = lines;
      if (!/^\d+$/.test(lines[0]!.trim())) warnings.push('cue without timing line');
    }
    for (const raw of body) {
      let speaker = 'unknown';
      let t = raw;
      const v = t.match(/^<v(?:\.[\w.-]+)?\s+([^>]+)>(.*)$/);
      if (v) {
        speaker = v[1]!.trim();
        t = v[2]!;
      } else {
        const s = t.match(/^\s*([^:]{1,60}?)\s*:\s+(.*)$/);
        if (s && plausibleSpeaker(s[1]!)) {
          speaker = s[1]!.trim();
          t = s[2]!;
        } else if (out.length) {
          speaker = out[out.length - 1]!.speaker;
        }
      }
      t = t.replace(/<\/?(?:v|c|i|b|u|lang|ruby|rt)[^>]*>/g, '').replace(/<\d{2}:\d{2}[^>]*>/g, '').trim();
      if (!t) continue;
      // One turn per cue; multi-line cues from the same speaker are joined.
      const prev = out[out.length - 1];
      if (prev && prev.speaker === speaker && prev.ts === ts) prev.text += ` ${t}`;
      else out.push({ speaker, ts, text: t });
    }
  }
  return out;
}

// ------------------------------------------------------------------ srt

/** SubRip: numbered cues with "00:00:01,000 --> 00:00:04,000" timings; same cue rules as VTT. */
function parseSrt(text: string, warnings: string[]): Omit<RawTurn, 'id' | 'role'>[] {
  // Drop ASS positioning tags ({\an8}) and "- " dialogue dashes at the start of a cue line.
  const body = text.replace(/\{\\[^}]*\}/g, '').replace(/^[ \t]*-[ \t]+/gm, '');
  return parseVtt(body, warnings);
}

// ------------------------------------------------------------------ doc (prose from PDF, DOCX, slides, HTML)

const DOC = 'Document';
const BULLET = /^([-*•▪◦‣–]|\d+[.)])\s+/;
const SLIDE = /^(slide|page)\s+(\d+)\b\s*[:.\-–—]?\s*(.*)$/i;

/** A heading line: markdown "#", "Slide 3: …", "2.1 Pricing", or a short title-like line on its own. */
function docHeading(line: string, standalone: boolean): string | null {
  const md = line.match(/^#{1,6}\s+(.+)$/);
  if (md) return md[1]!.trim();
  const slide = line.match(SLIDE);
  if (slide && slide[3]!.length <= 80) return slide[3] ? `${slide[1]![0]!.toUpperCase()}${slide[1]!.slice(1).toLowerCase()} ${slide[2]}: ${slide[3]}` : `${slide[1]![0]!.toUpperCase()}${slide[1]!.slice(1).toLowerCase()} ${slide[2]}`;
  if (!standalone || line.length > 72 || /[.!?,;:]$/.test(line) || BULLET.test(line)) return null;
  const words = line.split(/\s+/);
  if (words.length > 10) return null;
  if (/^\d+(\.\d+)*[.)]?\s+\p{Lu}/u.test(line)) return line;
  if (line === line.toUpperCase() && /\p{Lu}{3}/u.test(line)) return line;
  const caps = words.filter((w) => /^[\p{Lu}\d]/u.test(w)).length;
  return /^\p{Lu}/u.test(line) && caps / words.length >= 0.6 ? line : null;
}

/**
 * Prose split into turns: one per paragraph (hard-wrapped lines joined), bullet, or table row,
 * labelled with the nearest heading ("Section · Pricing") or "Document". A converted file that is
 * really a transcript ("Name: text" lines) is read by speaker instead.
 */
function parseDoc(text: string): { turns: Omit<RawTurn, 'id' | 'role'>[]; prose: boolean } {
  const lines = text.split('\n');
  const filled = lines.filter((l) => l.trim());
  const speakerLines = filled.filter((l) => {
    const m = l.match(TXT_LINE);
    return !!m && plausibleSpeaker(m[4]!);
  }).length;
  if (filled.length >= 4 && speakerLines / filled.length >= 0.4) return { turns: parseTxt(text), prose: false };
  const out: Omit<RawTurn, 'id' | 'role'>[] = [];
  let heading: string | null = null;
  let para: string[] = [];
  const label = () => (heading ? `Section · ${heading.replace(/[:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)}` : DOC);
  const flush = () => {
    const t = para.join(' ').trim();
    para = [];
    if (t) for (const piece of splitLongText(t)) out.push({ speaker: label(), ts: null, text: piece });
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!.trim();
    if (!l) {
      flush();
      continue;
    }
    const prevBlank = i === 0 || !lines[i - 1]!.trim();
    const nextBlank = i === lines.length - 1 || !lines[i + 1]!.trim();
    const h = docHeading(l, prevBlank && (nextBlank || /^#{1,6}\s|^(slide|page)\s+\d/i.test(l) || (i + 1 < lines.length && lines[i + 1]!.trim().length > l.length * 1.5)));
    if (h && para.length === 0) {
      heading = h;
      out.push({ speaker: DOC, ts: null, text: h });
      continue;
    }
    if (BULLET.test(l) || l.includes('\t') || (l.match(/\|/g)?.length ?? 0) >= 2) {
      flush();
      const row = l.replace(BULLET, '').replace(/\t+/g, ' · ').replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ' · ').trim();
      if (row && !/^[-:·\s]+$/.test(row)) out.push({ speaker: label(), ts: null, text: row });
      continue;
    }
    para.push(l);
  }
  flush();
  return { turns: out, prose: true };
}

// ------------------------------------------------------------------ json exports

type JsonDoc = { format: FileFormat; shape: 'transcript' | 'chat export' | 'document'; turns: Omit<RawTurn, 'id' | 'role'>[] };

const TEXT_KEYS = ['text', 'content', 'message', 'body', 'transcript', 'utterance', 'sentence', 'value', 'comment', 'answer', 'response'];
const SPEAKER_KEYS = ['speaker', 'speaker_name', 'speakerName', 'name', 'participant', 'user_name', 'username', 'real_name', 'display_name', 'author', 'from', 'sender', 'user', 'speakerId', 'speaker_id', 'role'];
const TIME_KEYS = ['start', 'start_time', 'startTime', 'offset', 'timestamp', 'ts', 'time', 'begin', 'created_at', 'createdAt'];
const LIST_KEYS = ['messages', 'transcript', 'transcripts', 'callTranscripts', 'segments', 'utterances', 'monologues', 'entries', 'results', 'timeline', 'conversation', 'items', 'data', 'records', 'comments', 'responses'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

function textOf(o: Obj): string | null {
  for (const k of TEXT_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  // Gong-style monologues: { speakerId, sentences: [{ start, end, text }] }; word lists.
  for (const k of ['sentences', 'words', 'fragments']) {
    const v = o[k];
    if (Array.isArray(v)) {
      const t = v.map((x) => (typeof x === 'string' ? x : isObj(x) ? (x.text ?? x.word ?? '') : '')).filter((x): x is string => typeof x === 'string' && !!x).join(k === 'words' ? ' ' : ' ');
      if (t.trim()) return t;
    }
  }
  return null;
}

function speakerOf(o: Obj): string | null {
  for (const k of ['user_profile', 'author', 'speaker', 'from', 'sender', 'user']) {
    const v = o[k];
    if (isObj(v)) {
      const n = v.real_name ?? v.display_name ?? v.name ?? v.email ?? v.id;
      if (typeof n === 'string' && n.trim()) return n;
    }
  }
  for (const k of SPEAKER_KEYS) {
    const v = o[k];
    if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v);
  }
  return null;
}

function hms(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

function timeOf(o: Obj): string | null {
  for (const k of TIME_KEYS) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v > 1e12) return new Date(v).toISOString().slice(11, 19); // epoch ms
      if (v > 1e9) return new Date(v * 1000).toISOString().slice(11, 19); // epoch s
      return hms(Number.isInteger(v) && v > 36_000 ? v / 1000 : v); // offset: ms when implausibly many seconds
    }
    if (typeof v === 'string' && v.trim()) {
      if (/^\d{9,11}(\.\d+)?$/.test(v)) return new Date(Number(v) * 1000).toISOString().slice(11, 19); // Slack ts
      const iso = v.match(/T(\d{2}:\d{2}:\d{2})/);
      if (iso) return iso[1]!;
      if (new RegExp(`^${TS}$`).test(v.trim())) return normTs(v.trim());
    }
  }
  return null;
}

/** The first array of message-like objects, searching known keys first (depth ≤ 4). */
function findMessages(v: unknown, depth = 0): Obj[] | null {
  if (depth > 4) return null;
  if (Array.isArray(v)) {
    const objs = v.filter(isObj);
    if (objs.length && objs.filter((o) => textOf(o)).length >= Math.max(1, objs.length * 0.5)) return objs;
    for (const o of objs.slice(0, 20)) {
      const inner = findMessages(o, depth + 1);
      if (inner) return objs.length > 1 ? objs.flatMap((x) => findMessages(x, depth + 1) ?? []) : inner;
    }
    return null;
  }
  if (isObj(v)) {
    const keys = [...LIST_KEYS.filter((k) => k in v), ...Object.keys(v).filter((k) => !LIST_KEYS.includes(k))];
    for (const k of keys) {
      const inner = findMessages(v[k], depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

/** Every string value long enough to be prose (for JSON with no message shape). */
function proseStrings(v: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 8 || out.length > 2000) return out;
  if (typeof v === 'string') {
    if (v.trim().length >= 20 && /\s/.test(v) && !/^(https?:|data:)/.test(v.trim())) out.push(v.trim());
  } else if (Array.isArray(v)) for (const x of v) proseStrings(x, out, depth + 1);
  else if (isObj(v)) for (const x of Object.values(v)) proseStrings(x, out, depth + 1);
  return out;
}

/** Slack markup: <@U123> mentions and <url|label> links read as plain text. */
function slackText(t: string): string {
  return t.replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_m, id: string, name?: string) => `@${name ?? id}`).replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2').replace(/<(https?:[^>]+)>/g, '$1');
}

/** Parse a raw JSON export into turns, or null when it is not JSON. */
export function jsonDocument(text: string): JsonDoc | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const msgs = findMessages(data);
  if (msgs?.length) {
    const chat = msgs.some((m) => m.type === 'message' || (typeof m.ts === 'string' && /^\d{9,11}(\.\d+)?$/.test(m.ts)) || ('user' in m && 'text' in m && !('speaker' in m)));
    const turns = msgs.flatMap((m) => {
      const raw = textOf(m);
      if (!raw) return [];
      const t = chat ? slackText(raw) : raw;
      return [{ speaker: speakerOf(m) ?? 'unknown', ts: timeOf(m), text: t.replace(/\s+/g, ' ').trim() }];
    });
    if (turns.length) return chat ? { format: 'chat', shape: 'chat export', turns } : { format: 'txt', shape: 'transcript', turns };
  }
  const prose = proseStrings(data);
  if (prose.length) return { format: 'doc', shape: 'document', turns: prose.flatMap((p) => splitLongText(p.replace(/\s+/g, ' '))).map((t) => ({ speaker: DOC, ts: null, text: t })) };
  return null;
}

// ------------------------------------------------------------------ md

function parseMd(text: string): Omit<RawTurn, 'id' | 'role'>[] {
  const out: Omit<RawTurn, 'id' | 'role'>[] = [];
  let body = text;
  const fm = body.match(/^---\n[\s\S]*?\n---\n/);
  if (fm) body = body.slice(fm[0].length);
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    out.push(mdTurn(para.join(' ')));
    para = [];
  };
  for (const line of body.split('\n')) {
    const l = line.trim();
    if (!l) {
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(l)) {
      flush();
      const heading = l.replace(/^#{1,6}\s+/, '').trim();
      if (heading) out.push({ speaker: 'Notes', ts: null, text: heading });
      continue;
    }
    if (/^([-*+]|\d+[.)])\s+/.test(l) || /^>\s?/.test(l) || /^\|/.test(l)) {
      flush();
      out.push(mdTurn(l.replace(/^([-*+]|\d+[.)])\s+/, '').replace(/^>\s?/, '').replace(/^\[[ xX]\]\s+/, '')));
      continue;
    }
    para.push(l);
  }
  flush();
  return out;
}

function mdTurn(text: string): Omit<RawTurn, 'id' | 'role'> {
  const m = text.match(/^\*\*([^*]{1,60}?):?\*\*:?\s+(.*)$/) ?? text.match(/^([A-Z][\w .'’()-]{1,40}?):\s+(.*)$/);
  if (m && plausibleSpeaker(m[1]!)) return { speaker: m[1]!.trim(), ts: null, text: m[2]! };
  return { speaker: 'Notes', ts: null, text };
}

// ------------------------------------------------------------------ eml

function parseHeaders(lines: string[]): { headers: Record<string, string>; rest: number } {
  const headers: Record<string, string> = {};
  let last = '';
  let i = 0;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.trim()) {
      i++;
      break;
    }
    const m = l.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (m) {
      last = m[1]!.toLowerCase();
      headers[last] = m[2]!;
    } else if (/^\s/.test(l) && last) headers[last] += ` ${l.trim()}`;
    else break;
  }
  return { headers, rest: i };
}

function displayName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);
  if (m) return m[1]!.trim();
  const e = from.match(/([\w.+-]+)@([\w.-]+)/);
  if (e) return from.trim();
  return from.trim() || 'unknown';
}

/** "On Mon, Oct 20, 2026 at 4:02 PM Marcus Bell <m@x.com> wrote:" → "Marcus Bell". */
export function wroteName(line: string): string {
  let s = line.replace(/^\s*On\s+/i, '').replace(/\s*wrote:\s*$/i, '').replace(/<[^>]*>/g, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const parts = s.split(/(?:\d{4}|\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?)\s*,?\s+(?:at\s+)?/);
  s = (parts[parts.length - 1] ?? '').replace(/^at\s+/i, '').replace(/,$/, '').trim();
  if (!s || /\d/.test(s) || s.split(/\s+/).length > 5) return 'unknown';
  return s;
}

function roleFromEmail(header: string): RawTurn['role'] | null {
  const m = header.match(/[\w.+-]+@([\w.-]+)/);
  if (!m) return null;
  return /(^|\.)invoca\./i.test(m[1]!) ? 'invoca' : 'customer';
}

function parseEml(text: string, warnings: string[]): { turns: Omit<RawTurn, 'id' | 'role'>[]; subject: string | null } {
  const lines = text.split('\n');
  const { headers, rest } = parseHeaders(lines);
  const subject = headers.subject ?? null;
  const out: Omit<RawTurn, 'id' | 'role'>[] = [];
  let speaker = headers.from ? displayName(headers.from) : 'unknown';
  let role: RawTurn['role'] | null = headers.from ? roleFromEmail(headers.from) : null;
  const ts: string | null = null;
  let para: string[] = [];
  const flush = () => {
    const t = para.join(' ').trim();
    if (t) out.push({ speaker, ts, text: t, ...(role ? { roleHint: role } : {}) } as Omit<RawTurn, 'id' | 'role'>);
    para = [];
  };
  const body = lines.slice(rest);
  if (!headers.from) warnings.push('email without From header');
  for (let i = 0; i < body.length; i++) {
    const rawLine = body[i]!;
    const l = rawLine.replace(/^(\s*>)+\s?/, '').trimEnd();
    if (/^-{2,}\s*(Forwarded message|Original Message)\s*-{2,}/i.test(l.trim())) {
      flush();
      // Following lines are headers of the forwarded/original message.
      const sub: string[] = [];
      let j = i + 1;
      while (j < body.length && /^(\s*>)*\s*(From|Date|Sent|To|Cc|Subject):/i.test(body[j]!)) sub.push(body[j]!.replace(/^(\s*>)+\s?/, '').trim()), j++;
      const h = parseHeaders([...sub, '']).headers;
      if (h.from) {
        speaker = displayName(h.from);
        role = roleFromEmail(h.from);
      }
      i = j - 1;
      continue;
    }
    const wrote = l.match(/^On\s.+?(?:\d{1,2}:\d{2}\s*(?:[AP]M)?,?)?\s*([^<,]+?)?\s*(?:<[^>]+>)?\s*wrote:\s*$/i);
    if (wrote) {
      flush();
      speaker = wroteName(l);
      role = roleFromEmail(l);
      continue;
    }
    const inlineFrom = l.match(/^From:\s+(.+)$/i);
    if (inlineFrom && i > 0 && !body[i - 1]!.trim()) {
      flush();
      speaker = displayName(inlineFrom[1]!);
      role = roleFromEmail(inlineFrom[1]!);
      let j = i + 1;
      while (j < body.length && /^(\s*>)*\s*(Date|Sent|To|Cc|Subject):/i.test(body[j]!)) j++;
      i = j - 1;
      continue;
    }
    if (!l.trim()) {
      flush();
      continue;
    }
    para.push(l.trim());
  }
  flush();
  return { turns: out, subject };
}

// ------------------------------------------------------------------ chat

const CHAT_PATTERNS: RegExp[] = [
  // [10:42 AM] dana.w: text · Slack export: [10/12/2026 9:10 AM] tom.lindqvist: text, thread replies "↳ […]"
  new RegExp(String.raw`^\s*(?:↳\s*)?\[\s*(?:\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4},?\s+)?(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?)\s*\]\s*@?([\w.\- ]{1,40}?)\s*:\s+(.*)$`),
  new RegExp(String.raw`^\s*@?([\w.\-]{1,30}(?: [\w.\-]{1,20})?)\s+\[\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?)\s*\]\s*:?\s+(.*)$`), // dana.w [10:42 AM]: text
  new RegExp(String.raw`^\s*(\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?)\s+@?([\w.\-]{1,30})\s*:\s+(.*)$`), // 10:42 dana: text
  /^\s*\*\*@?([\w.\- ]{1,30})\*\*\s*:?\s+(.*)$/, // **dana**: text
];

function parseChat(text: string): Omit<RawTurn, 'id' | 'role'>[] {
  const out: Omit<RawTurn, 'id' | 'role'>[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    let hit: { speaker: string; ts: string | null; text: string } | null = null;
    let m = line.match(CHAT_PATTERNS[0]!);
    if (m) hit = { ts: chatTs(m[1]!), speaker: m[2]!, text: m[3]! };
    else if ((m = line.match(CHAT_PATTERNS[1]!))) hit = { speaker: m[1]!, ts: chatTs(m[2]!), text: m[3]! };
    else if ((m = line.match(CHAT_PATTERNS[2]!))) hit = { ts: chatTs(m[1]!), speaker: m[2]!, text: m[3]! };
    else if ((m = line.match(CHAT_PATTERNS[3]!))) hit = { speaker: m[1]!, ts: null, text: m[2]! };
    else {
      // Slack copy-paste: "Dana W  10:42 AM" on its own line, message on the next lines.
      const hdr = line.match(/^\s*([A-Za-z][\w.\- ]{1,30}?)\s{1,}(\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?)\s*$/);
      if (hdr) {
        out.push({ speaker: hdr[1]!.trim(), ts: chatTs(hdr[2]!), text: '' });
        continue;
      }
      const generic = line.match(TXT_LINE);
      if (generic && plausibleSpeaker(generic[4]!)) hit = { speaker: generic[4]!, ts: normTs(generic[1] ?? generic[2] ?? generic[3]), text: generic[5]! };
    }
    if (hit) {
      out.push({ speaker: hit.speaker.trim(), ts: hit.ts, text: hit.text });
      continue;
    }
    // Export section markers ("--- #acct-northwind (internal) ---") start a context turn of
    // their own instead of being glued onto the previous message.
    if (/^\s*-{2,}.*-{2,}\s*$/.test(line)) {
      out.push({ speaker: 'unknown', ts: null, text: line.trim().replace(/^-+\s*|\s*-+$/g, '') });
      continue;
    }
    const prev = out[out.length - 1];
    if (prev) prev.text += `${prev.text ? ' ' : ''}${line.trim()}`;
    else out.push({ speaker: 'unknown', ts: null, text: line.trim() });
  }
  return out;
}

function chatTs(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[4]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}`;
}
