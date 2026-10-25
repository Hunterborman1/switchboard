/**
 * Renders (corrupted) generation output into the final file bytes for each format:
 * Zoom-style and raw-ASR WebVTT, bracketed/Otter-style/ASR text transcripts, Markdown notes,
 * RFC 822 email (.eml) with quoted replies and forwards, Slack exports and scratch dumps.
 */
import { createRng, type Rng } from './lib/rng.ts';
import type { Attendee, Card, GenEmail, GenOutput, GenTurn } from './lib/types.ts';
import { timeline } from './corrupt.ts';
import { accountShort } from './scenarios/backfill.ts';
import { accountById, PEOPLE, personById } from './world.ts';

const pad = (n: number, w = 2): string => String(Math.floor(n)).padStart(w, '0');

export function hms(sec: number, ms = false): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return ms ? `${base}.${pad(Math.round((sec % 1) * 1000), 3)}` : base;
}

function mss(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Split points (character offsets) that never fall inside a protected span. */
function safeSplits(text: string, protectedSpans: string[], maxWords: number, mode: 'sentence' | 'words', rng: Rng): string[] {
  const ranges: [number, number][] = [];
  for (const p of protectedSpans) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(p, from);
      if (i < 0) break;
      ranges.push([i, i + p.length]);
      from = i + 1;
    }
  }
  const inside = (pos: number): boolean => ranges.some(([a, b]) => pos > a && pos < b);
  const chunks: string[] = [];
  let start = 0;
  let words = 0;
  let target = mode === 'words' ? rng.int(7, 13) : maxWords;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ' ') continue;
    words++;
    const prev = text[i - 1] ?? '';
    const boundary = mode === 'words' ? words >= target : words >= maxWords * 0.5 && /[.?!]/.test(prev);
    if (boundary && !inside(i) && (mode === 'words' || words >= 12)) {
      chunks.push(text.slice(start, i));
      start = i + 1;
      words = 0;
      target = mode === 'words' ? rng.int(7, 13) : maxWords;
    }
  }
  chunks.push(text.slice(start));
  return chunks.filter((c) => c.trim().length > 0);
}

function speakerLabels(turns: GenTurn[], style: 'names' | 'generic'): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of turns) if (!m.has(t.speaker)) m.set(t.speaker, style === 'names' ? t.speaker : `Speaker ${m.size + 1}`);
  return m;
}

export function renderTranscript(card: Card, turns: GenTurn[], protectedSpans: string[]): string {
  const rng = createRng(`render:${card.fileId}`);
  const times = timeline(turns, card.corruptLevel, card.fileId);
  const generic = card.render === 'txt_asr' || (card.render === 'vtt_asr' && rng.chance(0.6));
  const labels = speakerLabels(turns, generic ? 'generic' : 'names');
  const label = (s: string): string => labels.get(s) ?? s;
  const a = card.accountId ? accountById(card.accountId) : null;
  const dateStr = new Date(card.startedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const last = times[times.length - 1];
  const duration = last ? last.end + 3 : 0;

  switch (card.render) {
    case 'vtt_zoom':
    case 'vtt_asr': {
      const lines = ['WEBVTT', ''];
      let n = 1;
      turns.forEach((t, i) => {
        const span = times[i] as { start: number; end: number };
        const chunks = card.render === 'vtt_zoom' ? safeSplits(t.text, protectedSpans, 42, 'sentence', rng) : safeSplits(t.text, protectedSpans, 0, 'words', rng);
        const totalWords = chunks.reduce((s, c) => s + c.split(' ').length, 0) || 1;
        let cursor = span.start;
        for (const c of chunks) {
          const dur = (span.end - span.start) * (c.split(' ').length / totalWords);
          lines.push(String(n++));
          lines.push(`${hms(cursor, true)} --> ${hms(cursor + dur, true)}`);
          lines.push(`${label(t.speaker)}: ${c}`);
          lines.push('');
          cursor += dur;
        }
      });
      return lines.join('\n');
    }
    case 'txt_bracket': {
      const head = a ? `${a.name} / Invoca | ${card.callType} | ${dateStr}\n\n` : '';
      return head + turns.map((t, i) => `[${hms((times[i] as { start: number }).start)}] ${label(t.speaker)}: ${t.text}`).join('\n') + '\n';
    }
    case 'txt_otter': {
      const title = a ? `${a.name} ${card.callType}` : card.callType;
      const time = card.startedAt.slice(11, 16);
      const h = Number(time.slice(0, 2));
      const head = `${title}\n${dateStr}, ${((h + 11) % 12) + 1}:${time.slice(3)}${h < 12 ? 'AM' : 'PM'} • ${mss(duration)}\n\n`;
      return head + turns.map((t, i) => `${label(t.speaker)}  ${mss((times[i] as { start: number }).start)}\n${t.text}`).join('\n\n') + '\n';
    }
    case 'txt_asr': {
      const head = `auto-transcript | ${card.filename.replace(/\.[a-z]+$/, '')} | duration ${hms(duration)} | speakers detected: ${labels.size}\n\n`;
      return head + turns.map((t, i) => `${label(t.speaker)}  ${hms((times[i] as { start: number }).start)}\n${t.text}`).join('\n\n') + '\n';
    }
    default:
      throw new Error(`renderTranscript: unsupported render ${card.render}`);
  }
}

// ------------------------------------------------------------------ email

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** RFC 2822 date in the given offset, e.g. "Fri, 16 Oct 2026 17:42:11 -0700". */
export function rfcDate(utc: Date, offset: string): string {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [oh, om] = offset.slice(1).split(':').map(Number) as [number, number];
  const local = new Date(utc.getTime() + sign * (oh * 60 + om) * 60_000);
  return `${DAYS[local.getUTCDay()]}, ${local.getUTCDate()} ${MONS[local.getUTCMonth()]} ${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())} ${offset.replace(':', '')}`;
}

function gmailDate(utc: Date, offset: string): string {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [oh, om] = offset.slice(1).split(':').map(Number) as [number, number];
  const local = new Date(utc.getTime() + sign * (oh * 60 + om) * 60_000);
  const h = local.getUTCHours();
  return `${DAYS[local.getUTCDay()]}, ${MONS[local.getUTCMonth()]} ${local.getUTCDate()}, ${local.getUTCFullYear()} at ${((h + 11) % 12) + 1}:${pad(local.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

function addressFor(name: string, attendees: Attendee[], accountId: string | null): string {
  const clean = name.replace(/<.*>/, '').trim();
  const known = attendees.find((a) => a.name.toLowerCase() === clean.toLowerCase());
  if (known?.email) return `${known.name} <${known.email}>`;
  const staff = PEOPLE.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (staff) return `${staff.name} <${staff.email}>`;
  const [first, ...rest] = clean.split(/\s+/);
  const last = rest[rest.length - 1] ?? 'team';
  const domain = accountId ? (attendees.find((a) => a.org === 'customer' && a.email)?.email?.split('@')[1] ?? 'invoca.example') : 'invoca.example';
  return `${clean} <${(first ?? 'x').toLowerCase()}.${last.toLowerCase()}@${domain}>`;
}

function msgId(rng: Rng, domain: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'CA';
  for (let i = 0; i < 38; i++) s += chars[rng.int(0, chars.length - 1)];
  return `<${s}@mail.${domain}>`;
}

function quote(text: string, depth = 1): string {
  const prefix = '> '.repeat(depth).replace(/ $/, ' ');
  return text.split('\n').map((l) => (l.length ? `${prefix}${l}` : prefix.trimEnd())).join('\n');
}

function subjectFromFilename(filename: string): string {
  return filename.replace(/\.eml$/i, '').replace(/_ /g, ': ').replace(/^fwd:/i, 'Fwd:').replace(/\bRE:/g, 'RE:');
}

function stripPrefix(subject: string): string {
  return subject.replace(/^(Fwd|FW|RE|Re):\s*/i, '');
}

export function renderEmail(card: Card, out: Extract<GenOutput, { kind: 'email_thread' | 'chaos_eml' }>): string {
  const rng = createRng(`eml:${card.fileId}`);
  const top = new Date(card.startedAt);
  const offset = card.startedAt.slice(-6);
  const emails = out.emails;
  const subject = subjectFromFilename(card.filename);
  const emailFull = (e: GenEmail): string => {
    const body = e.body.trim();
    const sig = e.signature?.trim();
    if (!sig) return body;
    // the generator sometimes repeats the signature block at the end of the body
    const lastSigLine = sig.split('\n').slice(-1)[0]?.trim() ?? '';
    if (lastSigLine && body.endsWith(lastSigLine)) return body;
    return `${body}\n\n${sig}`;
  };
  const sentAt = (e: GenEmail, i: number): Date => new Date(top.getTime() - ((e.minutesBefore ?? (emails.length - 1 - i) * 95) + (out.kind === 'chaos_eml' ? 25 : 0)) * 60_000);

  // newest message carries the quoted history
  const newestIdx = emails.length - 1;
  const chain = (upto: number, depth: number): string => {
    let s = '';
    for (let i = upto; i >= 0; i--) {
      const e = emails[i] as GenEmail;
      const d = depth + (upto - i);
      const header = `On ${gmailDate(sentAt(e, i), offset)} ${addressFor(e.from, card.attendees, card.accountId)} wrote:`;
      s += `\n\n${quote(header, d - 1)}\n${quote(emailFull(e), d)}`;
    }
    return s;
  };

  const headers: string[] = [];
  let body: string;
  let from: string;
  let to: string[];
  let cc: string[];
  const domain = 'invoca.example';
  if (out.kind === 'chaos_eml') {
    const sender = card.accountId ? personById(accountById(card.accountId).csmId) : null;
    from = sender ? `${sender.name} <${sender.email}>` : 'Customer Success <cs@invoca.example>';
    const internal = card.attendees.filter((a) => a.org === 'invoca' && a.name !== sender?.name);
    to = internal.slice(0, 1).map((a) => `${a.name} <${a.email}>`);
    cc = internal.slice(1).map((a) => `${a.name} <${a.email}>`);
    const newest = emails[newestIdx] as GenEmail;
    const excerpt = out.transcriptExcerpt.length ? `\n\n${out.transcriptExcerpt.map((t) => `${t.speaker}: ${t.text}`).join('\n')}` : '';
    body = `${out.forwardNote.trim()}${excerpt}\n\n---------- Forwarded message ---------\nFrom: ${addressFor(newest.from, card.attendees, card.accountId)}\nDate: ${gmailDate(sentAt(newest, newestIdx), offset)}\nSubject: ${stripPrefix(subject)}\nTo: ${newest.to.map((n) => addressFor(n, card.attendees, card.accountId)).join(', ')}${newest.cc?.length ? `\nCc: ${newest.cc.map((n) => addressFor(n, card.attendees, card.accountId)).join(', ')}` : ''}\n\n${emailFull(newest)}${newestIdx > 0 ? chain(newestIdx - 1, 1) : ''}\n`;
  } else {
    const newest = emails[newestIdx] as GenEmail;
    from = addressFor(newest.from, card.attendees, card.accountId);
    to = newest.to.map((n) => addressFor(n, card.attendees, card.accountId));
    cc = (newest.cc ?? []).map((n) => addressFor(n, card.attendees, card.accountId));
    body = `${emailFull(newest)}${newestIdx > 0 ? chain(newestIdx - 1, 1) : ''}\n`;
  }
  const senderDomain = from.match(/@([^>]+)>/)?.[1] ?? domain;
  const id = msgId(rng, senderDomain);
  const refs = Array.from({ length: Math.max(0, emails.length - (out.kind === 'chaos_eml' ? 0 : 1)) }, () => msgId(rng, senderDomain));
  const sentTop = rfcDate(top, offset);
  headers.push(`Return-Path: <${from.match(/<([^>]+)>/)?.[1] ?? ''}>`);
  headers.push(`Received: from smtp-out.${senderDomain} (smtp-out.${senderDomain} [10.${rng.int(10, 60)}.${rng.int(0, 255)}.${rng.int(2, 250)}])\n        by mx1.invoca.example with ESMTPS id ${rng.int(100000, 999999)}.${rng.int(1000, 9999)}\n        for <${(to[0] ?? '').match(/<([^>]+)>/)?.[1] ?? ''}>; ${sentTop}`);
  headers.push('MIME-Version: 1.0');
  headers.push(`Date: ${sentTop}`);
  headers.push(`Message-ID: ${id}`);
  if (refs.length) {
    headers.push(`In-Reply-To: ${refs[refs.length - 1]}`);
    headers.push(`References: ${refs.join('\n        ')}`);
  }
  headers.push(`Subject: ${subject}`);
  headers.push(`From: ${from}`);
  headers.push(`To: ${to.join(', ')}`);
  if (cc.length) headers.push(`Cc: ${cc.join(', ')}`);
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push('Content-Transfer-Encoding: 8bit');
  return `${headers.join('\n')}\n\n${body}`;
}

// ------------------------------------------------------------------ slack and notes

export const INTERNAL_MARK = '[[internal]]';

export function renderSlack(card: Card, out: Extract<GenOutput, { kind: 'chaos_chat' }>): string {
  const start = new Date(card.startedAt);
  const offset = card.startedAt.slice(-6);
  const sign = offset.startsWith('-') ? -1 : 1;
  const [oh, om] = offset.slice(1).split(':').map(Number) as [number, number];
  const short = card.accountId ? accountShort(card.accountId).toLowerCase() : 'general';
  const hasCustomer = card.attendees.some((a) => a.org === 'customer');
  const channel = card.filename.match(/slack-export_([a-z0-9-]+?)(_csm)?\.txt$/)?.[1];
  const name = hasCustomer ? `#ext-${short}-invoca` : card.callType === 'renewal' ? `#deal-${short}-renewal` : channel && channel !== short ? `#${channel.replace(/_/g, '-')}` : `#acct-${short}`;
  const fmt = (min: number): string => {
    const local = new Date(start.getTime() + min * 60_000 + sign * (oh * 60 + om) * 60_000);
    const h = local.getUTCHours();
    return `${local.getUTCMonth() + 1}/${local.getUTCDate()}/${local.getUTCFullYear()} ${((h + 11) % 12) + 1}:${pad(local.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const head = `Slack export · ${name}${hasCustomer ? ' (Slack Connect: shared with ' + (card.accountId ? accountById(card.accountId).name : 'customer') + ')' : ''}\nExported ${fmt((out.messages[out.messages.length - 1]?.minutesAfterStart ?? 0) + 3)} · ${out.messages.length} messages\n\n`;
  let lastMin = 0;
  // A message starting with INTERNAL_MARK begins the Invoca-only part of the export (a separate channel).
  let internal = false;
  const lines = out.messages.map((m) => {
    const min = Math.max(lastMin, m.minutesAfterStart ?? lastMin + 1);
    lastMin = min;
    let prefix = '';
    let body = m.text;
    if (body.startsWith(INTERNAL_MARK)) {
      body = body.slice(INTERNAL_MARK.length);
      if (!internal) prefix = `\n--- #acct-${short} (internal, Invoca only) ---\n\n`;
      internal = true;
    }
    const threaded = Boolean(m.threaded) && !prefix;
    const indent = threaded ? '    ↳ ' : '';
    const text = body.split('\n').join(`\n${threaded ? '      ' : '  '}`);
    return `${prefix}${indent}[${fmt(min)}] ${m.user}: ${text}`;
  });
  return head + lines.join('\n') + '\n';
}

export function renderNotes(out: Extract<GenOutput, { kind: 'notes_md' }>): string {
  return out.markdown.trim() + '\n';
}

export function renderDump(out: Extract<GenOutput, { kind: 'chaos_dump' }>): string {
  return out.text.replace(/\r\n/g, '\n').trimEnd() + '\n';
}
