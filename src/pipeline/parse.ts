/**
 * Normalize: detect the format (vtt, txt, md, eml, chat) and parse speakers and turns.
 * Robust to messy input: missing speakers, crosstalk markers, timestamp drift, mixed
 * formats, BOMs and CRLF. Output text is the original text (redaction happens next).
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

export function detectFormat(filename: string, content: string, hint?: FileFormat | null): FileFormat {
  if (hint) return hint;
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const head = content.replace(/^﻿/, '').trimStart();
  if (ext === 'vtt' || head.startsWith('WEBVTT')) return 'vtt';
  const firstLines = head.split(/\r?\n/).slice(0, 12);
  const headerCount = firstLines.filter((l) => /^(From|To|Subject|Date|Cc|Sent):\s/i.test(l)).length;
  if (ext === 'eml' || headerCount >= 2) return 'eml';
  if (ext === 'md' || ext === 'markdown') return 'md';
  const lines = head.split(/\r?\n/).filter((l) => l.trim());
  const chatLike = lines.filter((l) => CHAT_PATTERNS.some((re) => re.test(l))).length;
  if (ext === 'chat' || ext === 'json' || (lines.length >= 3 && chatLike / lines.length >= 0.5)) return 'chat';
  if (/^#{1,3}\s/m.test(head) && lines.filter((l) => /^\s*[-*]\s/.test(l)).length >= 3 && ext !== 'txt') return 'md';
  return 'txt';
}

export function parseDocument(filename: string, content: string, opts: ParseOptions = {}): ParsedDoc {
  const clean = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  const format = detectFormat(filename, clean, opts.formatHint);
  const warnings: string[] = [];
  let subject: string | null = null;
  let turns: Omit<RawTurn, 'id' | 'role'>[];
  switch (format) {
    case 'vtt':
      turns = parseVtt(clean, warnings);
      break;
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
  const withRoles = assignRoles(turns, opts.invocaNames ?? []);
  const out: RawTurn[] = withRoles.map((t, i) => ({ id: `t${String(i + 1).padStart(3, '0')}`, speaker: t.speaker, role: t.role, ts: t.ts, text: t.text }));
  const speakers = [...new Set(out.map((t) => t.speaker).filter((s) => s !== 'unknown'))];
  if (out.every((t) => t.speaker === 'unknown') && format !== 'md') warnings.push('no speaker labels found');
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
