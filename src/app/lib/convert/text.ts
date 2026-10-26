/**
 * Text-shaped formats to plain text: plain text and transcripts (txt, md, vtt, srt), JSON
 * exports, CSV/TSV, HTML, RTF, email (.eml MIME, .msg fallback). Pure string work with no DOM,
 * so the same code runs in the browser and in node unit tests.
 *
 * The output is shaped for src/pipeline/parse.ts: transcripts as "[00:01:12] Name: text"
 * lines, chats as "[2026-10-12 14:05] name: text", prose as paragraphs separated by blank
 * lines with "# " headings, tables as "| a | b |" rows.
 */
import type { FileFormat } from '../../../shared/contracts';
import type { Converted } from './types';

// ---------------------------------------------------------------- basics

/** BOM, CRLF, non-breaking spaces and control characters out; at most one blank line in a row. */
export function normalizeText(s: string): string {
  return s
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cut to `max` characters on a line (or word) boundary. */
export function capText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  let cut = text.lastIndexOf('\n', max);
  if (cut < max * 0.9) cut = text.lastIndexOf(' ', max);
  if (cut < max * 0.9) cut = max;
  // never split a surrogate pair
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return { text: text.slice(0, cut).trimEnd(), truncated: true };
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Bytes → a string with one char per byte (lossless; used to walk MIME structure). */
export function bytesToBinary(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return out;
}

export function binaryToBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

function base64ToBytes(s: string): Uint8Array {
  try {
    return binaryToBytes(atob(s.replace(/[^A-Za-z0-9+/=]/g, '')));
  } catch {
    return new Uint8Array();
  }
}

/** Decode bytes in a named charset, falling back to UTF-8 for labels the platform lacks. */
export function decodeBytes(b: Uint8Array, charset = 'utf-8'): string {
  const label = charset.trim().toLowerCase().replace(/^["']|["']$/g, '') || 'utf-8';
  try {
    return new TextDecoder(label).decode(b);
  } catch {
    return new TextDecoder('utf-8').decode(b);
  }
}

/** A text file's bytes to a string: BOMs honoured, UTF-8 first, Windows-1252 if that fails. */
export function decodeTextFile(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return decodeBytes(b, 'windows-1252');
  }
}

/** True when the first few KB look like binary (NUL bytes or many control characters). */
export function looksBinary(b: Uint8Array): boolean {
  const n = Math.min(b.length, 8192);
  if (!n) return false;
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return false;
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i]!;
    if (c === 0) return true;
    if (c < 9 || (c > 13 && c < 32)) ctrl++;
  }
  return ctrl / n > 0.1;
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', shy: '', zwj: '', zwnj: '',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„', laquo: '«', raquo: '»',
  bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°', times: '×', divide: '÷',
  eacute: 'é', egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à', acirc: 'â', iacute: 'í', oacute: 'ó', ocirc: 'ô', uacute: 'ú',
  ntilde: 'ñ', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', Eacute: 'É', Uuml: 'Ü', Ouml: 'Ö', Auml: 'Ä',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');

// ---------------------------------------------------------------- plain text and transcripts

const SRT_HEAD = /^\d+[ \t]*\n[ \t]*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}[ \t]*-->/;
/** Same chat shapes the pipeline recognises (src/pipeline/parse.ts CHAT_PATTERNS). */
const CHAT_LINE: RegExp[] = [
  /^\s*(?:↳\s*)?\[\s*(?:\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4},?\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\s*\]\s*@?[\w.\- ]{1,40}?\s*:\s+/,
  /^\s*@?[\w.-]{1,30}(?: [\w.-]{1,20})?\s+\[\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\s*\]\s*:?\s+/,
  /^\s*\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?\s+@?[\w.-]{1,30}\s*:\s+/,
  /^\s*\*\*@?[\w.\- ]{1,30}\*\*\s*:?\s+/,
];
const SPEAKER_LINE = /^\s*(?:[[(]?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?[\])]?\s*)?[-–—]?\s*([^:[\]]{1,48}?)\s*:\s+\S/;

/** The parser format a block of text reads as. Mirrors the pipeline's own sniffing. */
export function sniffTextFormat(text: string, ext = ''): FileFormat {
  const head = text.replace(/^\uFEFF/, '').trimStart();
  if (ext === 'vtt' || head.startsWith('WEBVTT')) return 'vtt';
  if (ext === 'srt' || SRT_HEAD.test(head)) return 'srt';
  const first = head.split('\n').slice(0, 12);
  if (ext === 'eml' || first.filter((l) => /^(From|To|Subject|Date|Cc|Sent):\s/i.test(l)).length >= 2) return 'eml';
  if (ext === 'md' || ext === 'markdown') return 'md';
  const lines = head.split('\n').filter((l) => l.trim());
  const chat = lines.filter((l) => CHAT_LINE.some((re) => re.test(l))).length;
  if (ext === 'chat' || (lines.length >= 3 && chat / lines.length >= 0.5)) return 'chat';
  return 'txt';
}

/** Share of non-empty lines that look like "Name: what they said". */
export function speakerLineShare(text: string): number {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return 0;
  const hits = lines.filter((l) => {
    const m = l.match(SPEAKER_LINE);
    if (!m) return false;
    const name = m[1]!.trim();
    const words = name.split(/\s+/).filter(Boolean);
    return words.length > 0 && words.length <= 5 && !/[.!?,;]$/.test(name);
  }).length;
  return hits / lines.length;
}

/** Plain text, Markdown, VTT and SRT pass through; the label says what it looks like. */
export function plainText(text: string, ext: string, filename: string): Converted {
  const formatHint = sniffTextFormat(text, ext);
  let label: string;
  switch (formatHint) {
    case 'vtt':
      label = /^GMT\d|\.transcript\.vtt$/i.test(filename) ? 'Zoom transcript (VTT)' : 'Transcript (VTT)';
      break;
    case 'srt':
      label = 'Transcript (SRT)';
      break;
    case 'eml':
      label = 'Email thread';
      break;
    case 'md':
      label = 'Markdown notes';
      break;
    case 'chat':
      label = 'Chat export';
      break;
    default:
      label = speakerLineShare(text) >= 0.4 ? 'Transcript (text)' : 'Text document';
  }
  return { text, formatHint, label };
}

// ---------------------------------------------------------------- JSON exports

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

const TEXT_KEYS = ['text', 'content', 'message', 'body', 'transcript', 'utterance', 'sentence', 'comment', 'answer', 'response'];
const SPEAKER_OBJ_KEYS = ['user_profile', 'author', 'speaker', 'from', 'sender', 'user'];
const SPEAKER_KEYS = ['speaker', 'speaker_name', 'speakerName', 'name', 'participant', 'username', 'user_name', 'real_name', 'display_name', 'displayName', 'author', 'from', 'sender', 'user', 'speakerId', 'speaker_id', 'role'];
const TIME_KEYS = ['start', 'start_time', 'startTime', 'offset', 'timestamp', 'ts', 'time', 'begin', 'createdDateTime', 'created_at', 'createdAt'];
const LIST_KEYS = ['messages', 'transcript', 'transcripts', 'callTranscripts', 'segments', 'utterances', 'monologues', 'entries', 'results', 'timeline', 'conversation', 'items', 'data', 'records', 'value', 'comments', 'responses'];
const PEOPLE_KEYS = ['parties', 'participants', 'speakers', 'users', 'members', 'people'];

const isSlackTs = (v: unknown) => typeof v === 'string' && /^\d{9,11}(\.\d+)?$/.test(v);

function textOf(o: Obj): string | null {
  for (const k of TEXT_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    // Teams / Graph: body: { contentType: 'html', content: '<p>…</p>' }
    if (isObj(v) && typeof v.content === 'string' && v.content.trim()) {
      return v.contentType === 'html' || /<\w[^>]*>/.test(v.content) ? htmlToText(v.content).text : v.content;
    }
  }
  // Gong-style monologues: { speakerId, sentences: [{ start, end, text }] }; word lists.
  for (const k of ['sentences', 'words', 'fragments']) {
    const v = o[k];
    if (Array.isArray(v)) {
      const t = v
        .map((x) => (typeof x === 'string' ? x : isObj(x) ? (x.text ?? x.word ?? '') : ''))
        .filter((x): x is string => typeof x === 'string' && !!x)
        .join(' ');
      if (t.trim()) return t;
    }
  }
  return null;
}

function nameOfObj(v: Obj): string | null {
  const user = isObj(v.user) ? v.user : null;
  const n = v.real_name ?? v.display_name ?? v.displayName ?? v.name ?? user?.displayName ?? user?.name ?? v.email ?? v.id;
  return typeof n === 'string' && n.trim() ? n.trim() : typeof n === 'number' ? String(n) : null;
}

function speakerOf(o: Obj, names: Map<string, string>): string | null {
  for (const k of SPEAKER_OBJ_KEYS) {
    const v = o[k];
    if (isObj(v)) {
      const n = nameOfObj(v);
      if (n) return names.get(n) ?? n;
    }
  }
  for (const k of SPEAKER_KEYS) {
    const v = o[k];
    if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return names.get(String(v)) ?? String(v).trim();
  }
  return null;
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
function hms(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
}
/** "2026-10-12 14:05" in UTC: a stable stamp the chat parser reads. */
function stamp(ms: number): string {
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 16).replace('T', ' ') : '';
}

type When = { kind: 'offset' | 'abs'; value: string };
function timeValue(v: unknown): When | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 1e12) return { kind: 'abs', value: stamp(v) };
    if (v > 1e9) return { kind: 'abs', value: stamp(v * 1000) };
    // offsets: milliseconds when implausibly many seconds for a call
    return { kind: 'offset', value: hms(Number.isInteger(v) && v > 36_000 ? v / 1000 : v) };
  }
  if (typeof v === 'string' && v.trim()) {
    const t = v.trim();
    if (isSlackTs(t)) return { kind: 'abs', value: stamp(Number(t) * 1000) };
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(t)) return { kind: 'abs', value: stamp(Date.parse(t)) || t.slice(0, 16).replace('T', ' ') };
    const m = t.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d+)?$/);
    if (m) return { kind: 'offset', value: `${pad(Number(m[1] ?? 0))}:${pad(Number(m[2]))}:${m[3]}` };
  }
  return null;
}

function timeOf(o: Obj): When | null {
  for (const k of TIME_KEYS) {
    const w = timeValue(o[k]);
    if (w) return w;
  }
  const first = Array.isArray(o.sentences) && isObj(o.sentences[0]) ? o.sentences[0] : null;
  return first ? timeValue(first.start) : null;
}

function findMessages(v: unknown, depth = 0): Obj[] | null {
  if (depth > 4) return null;
  if (Array.isArray(v)) {
    const objs = v.filter(isObj);
    if (objs.length && objs.filter((o) => textOf(o)).length >= Math.max(1, objs.length * 0.5)) return objs;
    const inner = objs.map((o) => findMessages(o, depth + 1)).filter((x): x is Obj[] => !!x);
    return inner.length ? inner.flat() : null;
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

/** speakerId → name from a parties / participants list anywhere near the top. */
function speakerNames(root: unknown): Map<string, string> {
  const names = new Map<string, string>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 3 || !isObj(v)) return;
    for (const k of PEOPLE_KEYS) {
      const list = v[k];
      if (!Array.isArray(list)) continue;
      for (const p of list.filter(isObj)) {
        const name = p.name ?? p.displayName ?? p.real_name ?? p.display_name ?? p.emailAddress ?? p.email;
        if (typeof name !== 'string' || !name.trim()) continue;
        for (const idKey of ['speakerId', 'speaker_id', 'id', 'userId', 'user_id']) {
          const id = p[idKey];
          if (typeof id === 'string' || typeof id === 'number') names.set(String(id), name.trim());
        }
      }
    }
    for (const x of Object.values(v)) if (isObj(x)) visit(x, depth + 1);
  };
  visit(root, 0);
  return names;
}

function jsonLabel(root: unknown, msgs: Obj[], chat: boolean): string {
  const top = isObj(root) ? root : {};
  if (msgs.some((m) => isSlackTs(m.ts) || (m.type === 'message' && 'user' in m))) return 'Slack export (JSON)';
  if (msgs.some((m) => 'createdDateTime' in m || 'messageType' in m || (isObj(m.from) && isObj(m.from.user)))) return 'Teams chat export (JSON)';
  if ('callTranscripts' in top || msgs.some((m) => 'speakerId' in m && Array.isArray(m.sentences))) return 'Gong transcript (JSON)';
  if ('timeline' in top || 'recording_files' in top || 'meeting_id' in top || msgs.some((m) => 'username' in m)) return 'Zoom transcript (JSON)';
  return chat ? 'Chat export (JSON)' : 'Transcript (JSON)';
}

function humanKey(k: string): string {
  return k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
}

/** Anything else: readable "Key: value" lines, one blank line between records. */
function jsonLines(v: unknown, path: string[], out: string[], depth: number): void {
  if (depth > 8 || out.length > 20_000) return;
  const label = path.length ? path.join(' ') : '';
  const lead = label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}: ` : '';
  if (v === null || v === undefined || v === '') return;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    out.push(`${lead}${typeof v === 'string' ? oneLine(v) : String(v)}`);
    return;
  }
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object' || x === null)) {
      const items = v.filter((x) => x !== null && x !== '').map((x) => String(x));
      if (items.length) out.push(`${lead}${items.join(', ')}`);
      return;
    }
    for (const x of v) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      jsonLines(x, path, out, depth + 1);
    }
    return;
  }
  if (isObj(v)) for (const [k, x] of Object.entries(v)) jsonLines(x, [...path, humanKey(k)], out, depth + 1);
}

/** JSON exports: transcripts, chat exports, or anything else as readable key/value text. */
export function jsonToText(raw: string): Converted | null {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  const msgs = findMessages(data);
  if (msgs?.length) {
    const names = speakerNames(data);
    // Messages (Slack, Teams, any {user|from, text, ts}) rather than a timed transcript: a
    // transcript has speakers and offsets ("00:01:12"), a chat has users and clock times.
    const chat = msgs.some(
      (m) =>
        m.type === 'message' ||
        isSlackTs(m.ts) ||
        'createdDateTime' in m ||
        'messageType' in m ||
        (!('speaker' in m) && !('start' in m) && ('user' in m || 'from' in m || timeValue(m.ts)?.kind === 'abs')),
    );
    const lines = msgs.flatMap((m) => {
      const t = textOf(m);
      if (!t) return [];
      const text = oneLine(chat ? slackText(t) : t);
      if (!text) return [];
      const who = speakerOf(m, names) ?? 'Unknown';
      const when = timeOf(m);
      return [`${when ? `[${when.value}] ` : ''}${who}: ${text}`];
    });
    if (lines.length) return { text: lines.join('\n'), formatHint: chat ? 'chat' : 'txt', label: jsonLabel(data, msgs, chat) };
  }
  const out: string[] = [];
  jsonLines(data, [], out, 0);
  return { text: out.join('\n'), formatHint: 'doc', label: 'JSON data' };
}

/** Slack markup: <@U123|dana> mentions and <url|label> links read as plain text. */
function slackText(t: string): string {
  return t
    .replace(/<@([A-Z0-9]+)(?:\|([^>]+))?>/g, (_m, id: string, name?: string) => `@${name ?? id}`)
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:[^>]+)>/g, '$1');
}

// ---------------------------------------------------------------- CSV / TSV and tables

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

export function guessDelimiter(text: string): string {
  const head = text.split('\n').slice(0, 5).join('\n');
  const count = (d: string) => head.split(d).length - 1;
  const best = [',', ';', '\t', '|'].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0]!;
  return best[1] > 0 ? best[0] : ',';
}

const SPEAKER_COLS = ['speaker', 'speaker name', 'name', 'participant', 'user', 'username', 'user name', 'author', 'from', 'sender', 'who'];
const TEXT_COLS = ['text', 'message', 'transcript', 'content', 'body', 'utterance', 'comment', 'comments', 'response', 'feedback', 'note', 'notes', 'answer', 'verbatim', 'quote'];
const TIME_COLS = ['start', 'start time', 'timestamp', 'time', 'ts', 'offset', 'begin'];

/**
 * Rows to text. With a speaker column and a text column it is a transcript ("[ts] Name: text");
 * otherwise a table, one "| a | b |" line per row with the header first.
 */
export function tableToText(rows: string[][]): { text: string; transcript: boolean } {
  if (!rows.length) return { text: '', transcript: false };
  const header = rows[0]!.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const sp = col(SPEAKER_COLS);
  const tx = col(TEXT_COLS);
  const tm = col(TIME_COLS);
  if (rows.length >= 2 && sp >= 0 && tx >= 0 && sp !== tx) {
    const lines = rows.slice(1).flatMap((r) => {
      const text = oneLine(r[tx] ?? '');
      if (!text) return [];
      const raw = tm >= 0 ? (r[tm] ?? '').trim() : '';
      const when = raw ? (timeValue(/^\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw)?.value ?? raw) : '';
      return [`${when ? `[${when}] ` : ''}${oneLine(r[sp] ?? '') || 'Unknown'}: ${text}`];
    });
    return { text: lines.join('\n'), transcript: true };
  }
  const width = Math.max(...rows.map((r) => r.length));
  const lines = rows.map((r) => `| ${Array.from({ length: width }, (_, i) => oneLine(r[i] ?? '')).join(' | ')} |`);
  return { text: lines.join('\n'), transcript: false };
}

export function delimitedToText(raw: string, ext: 'csv' | 'tsv'): Converted {
  const rows = parseDelimited(raw.replace(/^\uFEFF/, ''), ext === 'tsv' ? '\t' : guessDelimiter(raw));
  const t = tableToText(rows);
  const kind = ext.toUpperCase();
  return t.transcript ? { text: t.text, formatHint: 'txt', label: `Transcript (${kind})` } : { text: t.text, formatHint: 'doc', label: `Table (${kind})` };
}

// ---------------------------------------------------------------- HTML

const BLOCK_TAGS = 'p|div|section|article|header|footer|main|nav|aside|blockquote|figure|figcaption|address|form|fieldset|table|thead|tbody|tfoot|ul|ol|dl|hr|center';

/**
 * HTML to text with paragraphs and headings kept ("# Heading" lines). `tables: false` reads
 * layout tables (HTML email) as plain blocks instead of "| a | b |" rows.
 */
export function htmlToText(html: string, opts: { tables?: boolean } = {}): { text: string; title: string | null } {
  const tables = opts.tables ?? true;
  const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg|head|object|iframe|select)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!doctype[^>]*>/gi, ' ');
  const body = s.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (body) s = body[1]!;
  // <pre> keeps its own line breaks.
  const pres: string[] = [];
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_m, inner: string) => `\uE000${pres.push(inner) - 1}\uE001`);
  s = s.replace(/\s+/g, ' ');
  // Entities are decoded once, at the end, after the tags are gone.
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_m, level: string, inner: string) => {
    const t = oneLine(stripTags(inner));
    return t ? `\n\n${'#'.repeat(Number(level))} ${t}\n\n` : '\n\n';
  });
  if (tables) {
    // One line per row; block content inside a cell stays inside the cell.
    s = s.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi, (_m, inner: string) => {
      const cells = inner
        .split(/<t[dh]\b[^>]*>/i)
        .slice(1)
        .map((c) => oneLine(stripTags(c.replace(/<br\s*\/?>/gi, ' '))));
      return cells.some(Boolean) ? `\n| ${cells.join(' | ')} |` : '';
    });
  } else {
    s = s.replace(/<\/?(tr|td|th)\b[^>]*>/gi, '\n');
  }
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<li\b[^>]*>/gi, '\n- ');
  s = s
    .replace(new RegExp(`</?(${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n\n')
    .replace(/<\/?(dt|dd|caption)\b[^>]*>/gi, '\n')
    .replace(/<\/li\s*>/gi, '');
  s = decodeEntities(stripTags(s));
  s = s.replace(/\uE000(\d+)\uE001/g, (_m, i: string) => `\n\n${decodeEntities(stripTags(pres[Number(i)] ?? ''))}\n\n`);
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l) => !/^\|[\s|]*\|$/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const title = titleRaw ? oneLine(decodeEntities(stripTags(titleRaw))) || null : null;
  return { text: s, title };
}

// ---------------------------------------------------------------- RTF

const RTF_SKIP = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
  'fldinst', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl',
  'mmathPr', 'pgdsctbl', 'filetbl', 'revtbl', 'listtext', 'pntext', 'bkmkstart', 'bkmkend', 'xe', 'tc', 'nonshppict', 'blipuid', 'docvar',
]);
const RTF_CHAR: Record<string, string> = { emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', tab: ' ', cell: ' | ', line: '\n', par: '\n\n', sect: '\n\n', page: '\n\n', row: '\n' };
/** Windows-1252 0x80–0x9F, which \'hh escapes use. */
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const cp1252 = (byte: number) => (byte >= 0x80 && byte <= 0x9f ? CP1252[byte - 0x80]! : String.fromCharCode(byte));

/** Rich text to plain text: control words stripped, paragraphs kept, hidden groups skipped. */
export function rtfToText(rtf: string): string {
  let out = '';
  type G = { skip: boolean; uc: number };
  const stack: G[] = [];
  let g: G = { skip: false, uc: 1 };
  let pendingSkip = 0; // characters to drop after \uN (its ANSI fallback)
  let starNext = false;
  let i = 0;
  const emit = (s: string) => {
    if (g.skip) return;
    if (pendingSkip > 0) {
      pendingSkip--;
      return;
    }
    out += s;
  };
  while (i < rtf.length) {
    const c = rtf[i]!;
    if (c === '{') {
      stack.push(g);
      g = { ...g };
      i++;
      continue;
    }
    if (c === '}') {
      g = stack.pop() ?? { skip: false, uc: 1 };
      pendingSkip = 0;
      i++;
      continue;
    }
    if (c === '\\') {
      const next = rtf[i + 1] ?? '';
      if (next === '\\' || next === '{' || next === '}') {
        emit(next);
        i += 2;
        continue;
      }
      if (next === "'") {
        const byte = parseInt(rtf.slice(i + 2, i + 4), 16);
        if (Number.isFinite(byte)) emit(cp1252(byte));
        i += 4;
        continue;
      }
      if (next === '*') {
        starNext = true;
        i += 2;
        continue;
      }
      if (next === '~') {
        emit(' ');
        i += 2;
        continue;
      }
      if (next === '-') {
        i += 2;
        continue;
      }
      if (next === '_') {
        emit('-');
        i += 2;
        continue;
      }
      if (next === '\n' || next === '\r') {
        emit('\n\n');
        i += 2;
        continue;
      }
      const m = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(rtf.slice(i + 1, i + 46));
      if (!m) {
        i += 2;
        continue;
      }
      i += 1 + m[0].length;
      const word = m[1]!;
      const param = m[2] !== undefined ? Number(m[2]) : null;
      if (starNext || RTF_SKIP.has(word)) {
        g.skip = true;
        starNext = false;
        continue;
      }
      if (word === 'uc' && param !== null) {
        g.uc = param;
        continue;
      }
      if (word === 'u' && param !== null) {
        const cp = param < 0 ? param + 65536 : param;
        emit(String.fromCharCode(cp));
        pendingSkip = g.uc;
        continue;
      }
      const ch = RTF_CHAR[word];
      if (ch !== undefined) emit(ch);
      continue;
    }
    if (c === '\r' || c === '\n') {
      i++;
      continue;
    }
    emit(c);
    i++;
  }
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------- email (.eml) and Outlook (.msg)

type Part = { headers: Record<string, string>; body: string };
const KNOWN_HEADERS = /^(from|to|cc|bcc|subject|date|sent|content-type|mime-version|received|message-id|return-path|reply-to|x-[\w-]+)$/i;

function splitPart(raw: string): Part {
  const sep = /\r?\n\r?\n/.exec(raw);
  const head = sep ? raw.slice(0, sep.index) : raw;
  const headers: Record<string, string> = {};
  let known = 0;
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1]!.toLowerCase();
    if (KNOWN_HEADERS.test(k)) known++;
    if (!(k in headers)) headers[k] = m[2]!.trim();
  }
  // No real headers: the whole thing is the body.
  if (!known) return { headers: {}, body: raw };
  return { headers, body: sep ? raw.slice(sep.index + sep[0].length) : '' };
}

function contentType(v: string | undefined): { type: string; params: Record<string, string> } {
  const value = v ?? 'text/plain';
  const type = (value.split(';')[0] ?? '').trim().toLowerCase() || 'text/plain';
  const params: Record<string, string> = {};
  for (const m of value.matchAll(/;\s*([\w*-]+)\s*=\s*(?:"([^"]*)"|([^;\s]*))/g)) params[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? '';
  return { type, params };
}

function decodePartBody(p: Part, charset: string | undefined): string {
  const enc = (p.headers['content-transfer-encoding'] ?? '').trim().toLowerCase();
  let bytes: Uint8Array;
  if (enc === 'base64') bytes = base64ToBytes(p.body);
  else if (enc === 'quoted-printable') bytes = binaryToBytes(p.body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))));
  else bytes = binaryToBytes(p.body);
  return decodeBytes(bytes, charset ?? 'utf-8');
}

function splitMultipart(body: string, boundary: string | undefined): Part[] {
  if (!boundary) return [];
  const marker = `--${boundary}`;
  const chunks = body.split(marker).slice(1);
  const parts: Part[] = [];
  for (const chunk of chunks) {
    if (chunk.startsWith('--')) break;
    parts.push(splitPart(chunk.replace(/^[ \t]*\r?\n/, '')));
  }
  return parts;
}

function partText(p: Part, depth = 0): string | null {
  if (depth > 8) return null;
  const ct = contentType(p.headers['content-type']);
  if (ct.type.startsWith('multipart/')) {
    const subs = splitMultipart(p.body, ct.params.boundary);
    if (ct.type === 'multipart/alternative') {
      const typeOf = (s: Part) => contentType(s.headers['content-type']).type;
      const pick = subs.find((s) => typeOf(s) === 'text/plain') ?? subs.find((s) => typeOf(s) === 'text/html') ?? subs.find((s) => typeOf(s).startsWith('multipart/'));
      return pick ? partText(pick, depth + 1) : null;
    }
    const texts = subs.map((s) => partText(s, depth + 1)).filter((t): t is string => !!t && !!t.trim());
    return texts.length ? texts.join('\n\n') : null;
  }
  if ((p.headers['content-disposition'] ?? '').toLowerCase().startsWith('attachment') && ct.type !== 'message/rfc822') return null;
  if (ct.type === 'text/plain' || ct.type === 'text/markdown') return decodePartBody(p, ct.params.charset);
  if (ct.type === 'text/html') return htmlToText(decodePartBody(p, ct.params.charset), { tables: false }).text;
  if (ct.type === 'message/rfc822') return messageText(splitPart(p.body), depth + 1);
  return null;
}

function decodeHeader(v: string): string {
  // raw 8-bit header bytes are UTF-8 in practice
  const raw = /[\x80-\xff]/.test(v) ? decodeBytes(binaryToBytes(v), 'utf-8') : v;
  return raw
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, enc: string, txt: string) => {
      const bytes =
        enc.toUpperCase() === 'B' ? base64ToBytes(txt) : binaryToBytes(txt.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16))));
      return decodeBytes(bytes, cs);
    })
    .trim();
}

const SHOWN_HEADERS: [string, string][] = [
  ['from', 'From'],
  ['to', 'To'],
  ['cc', 'Cc'],
  ['date', 'Date'],
  ['subject', 'Subject'],
];

function messageText(p: Part, depth = 0): string {
  const head = SHOWN_HEADERS.filter(([k]) => p.headers[k]).map(([k, label]) => `${label}: ${decodeHeader(p.headers[k]!)}`);
  const body = (Object.keys(p.headers).length ? partText(p, depth) : decodePartBody(p, 'utf-8')) ?? '';
  return [head.join('\n'), body.trim()].filter(Boolean).join('\n\n');
}

/** An .eml file (MIME): the readable headers, then the best text body (plain over HTML). */
export function emlToText(bytes: Uint8Array): Converted {
  let raw = bytesToBinary(bytes).replace(/^\uFEFF|^\xEF\xBB\xBF/, '');
  if (/^From \S/.test(raw)) raw = raw.slice(raw.indexOf('\n') + 1); // mbox separator line
  const part = splitPart(raw);
  const text = messageText(part);
  const subject = part.headers.subject ? decodeHeader(part.headers.subject) : '';
  const thread = /^(re|fw|fwd|aw|wg|sv)\s*:/i.test(subject) || /^On .{6,120} wrote:\s*$/m.test(text) || /^>/m.test(text) || /-----\s*Original Message\s*-----/i.test(text);
  return { text, formatHint: 'eml', label: thread ? 'Email thread' : 'Email' };
}

function printableRuns(text: string): string[] {
  return text
    .split(/[^\t\n\r\x20-\x7E\u00A0-ɏ‐-›€]+/)
    .map((r) => r.trim())
    .filter((r) => r.length >= 8 && /[A-Za-z]{3}/.test(r) && (r.match(/[A-Za-z0-9 .,'"!?:;@()\-\n]/g)?.length ?? 0) / r.length >= 0.85);
}

/**
 * Outlook .msg (a compound binary file): no full parser, just the readable strings. Headers
 * become an email header block when they are there; the longest run is the body.
 */
export function msgToText(bytes: Uint8Array): Converted {
  // Properties are stored as UTF-16LE (and sometimes 8-bit) strings in separate streams.
  let utf16 = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) utf16 += String.fromCharCode(bytes[i]! | (bytes[i + 1]! << 8));
  const runs = [...printableRuns(utf16), ...printableRuns(bytesToBinary(bytes))];
  const unique: string[] = [];
  for (const r of runs.sort((a, b) => b.length - a.length)) if (!unique.some((u) => u.includes(r))) unique.push(r);
  const headerRun = unique.find((r) => /^From:\s/m.test(r) && /^Subject:\s/m.test(r));
  const rest = unique.filter((r) => r !== headerRun);
  const bodyRun = rest[0] ?? '';
  const body = /<(html|body|div|p)\b/i.test(bodyRun) ? htmlToText(bodyRun, { tables: false }).text : bodyRun;
  if (headerRun) {
    const head = headerRun
      .split(/\r?\n/)
      .filter((l) => /^(From|To|Cc|Date|Subject):\s/i.test(l))
      .join('\n');
    return { text: `${head}\n\n${body}`, formatHint: 'eml', label: 'Outlook email', warnings: ['Read as plain text: formatting and attachments were skipped.'] };
  }
  return { text: [body, ...rest.slice(1, 6)].join('\n\n'), formatHint: 'txt', label: 'Outlook email', warnings: ['Read as plain text: formatting and attachments were skipped.'] };
}
