import { describe, expect, it } from 'vitest';
import { assignRoles, detectFormat, parseDocument, wroteName } from '../../../src/pipeline/parse.ts';
import { fixtureFile } from '../../helpers/fixtures.ts';

describe('detectFormat', () => {
  it('uses the hint, extension, then content', () => {
    expect(detectFormat('x.txt', 'hello', 'md')).toBe('md');
    expect(detectFormat('a.vtt', '')).toBe('vtt');
    expect(detectFormat('a', 'WEBVTT\n\n00:00.000 --> 00:01.000\nhi')).toBe('vtt');
    expect(detectFormat('a', 'From: a@b.com\nSubject: hi\nTo: c@d.com\n\nbody')).toBe('eml');
    expect(detectFormat('notes.md', '# hi')).toBe('md');
    expect(detectFormat('dump', '[10:42 AM] dana: hi\n[10:43 AM] marc: yo\n[10:44 AM] dana: ok')).toBe('chat');
    expect(detectFormat('plain', 'Customer: hello there\nCSM: hi')).toBe('txt');
  });
});

describe('vtt', () => {
  it('parses <v> speakers, timestamps and keeps one turn per cue', () => {
    const d = parseDocument('qbr.vtt', fixtureFile('brightline-qbr.vtt'));
    expect(d.format).toBe('vtt');
    expect(d.turns[0]).toMatchObject({ id: 't001', speaker: 'Dana Whitfield (Brightline)', ts: '00:00:04', role: 'customer' });
    expect(d.turns[1]!.role).toBe('invoca');
    expect(d.turns.length).toBe(8);
    expect(d.speakers.length).toBe(2);
  });
  it('handles NOTE blocks, cue ids, "Name: text" lines, inline tags and CRLF/BOM', () => {
    const raw = '﻿WEBVTT\r\n\r\nNOTE exported by recorder\r\n\r\n1\r\n00:00:01.000 --> 00:00:03.000\r\nSpeaker 1: we need <i>better</i> reports\r\n\r\n2\r\n00:00:04.000 --> 00:00:06.000\r\nand faster ones\r\n';
    const d = parseDocument('x.vtt', raw);
    expect(d.turns.map((t) => t.text)).toEqual(['we need better reports', 'and faster ones']);
    expect(d.turns[1]!.speaker).toBe('Speaker 1');
    expect(d.turns[0]!.ts).toBe('00:00:01');
  });
});

describe('txt', () => {
  it('parses bracketed timestamps and speaker labels with roles', () => {
    const d = parseDocument('m.txt', fixtureFile('meridian-phi.txt'));
    expect(d.turns.length).toBe(5);
    expect(d.turns[0]).toMatchObject({ speaker: 'Aisha (Invoca CSM)', role: 'invoca', ts: '00:00:02' });
    expect(d.turns[1]!.role).toBe('customer');
  });
  it('joins continuation lines and handles ASR "Speaker 2" without a colon and [crosstalk]', () => {
    const raw = '00:01:02 SPEAKER_02 so the uh the reports are\nreally slow [crosstalk]\n00:01:09 Speaker 1 - ok got it\n\nrandom paragraph with no speaker';
    const d = parseDocument('asr.txt', raw);
    expect(d.turns[0]).toMatchObject({ speaker: 'SPEAKER 02', ts: '00:01:02' });
    expect(d.turns[0]!.text).toBe('so the uh the reports are really slow [crosstalk]');
    expect(d.turns[1]!.speaker).toBe('Speaker 1');
    expect(d.turns[2]!.speaker).toBe('unknown');
  });
  it('does not treat prose with colons or URLs as speakers', () => {
    const d = parseDocument('n.txt', 'so the thing we keep hitting is this: exports fail\nsee https://example.com/x for details');
    expect(d.turns.every((t) => t.speaker === 'unknown')).toBe(true);
  });
  it('falls back to one block when nothing parses', () => {
    const d = parseDocument('x.txt', '   just words   ');
    expect(d.turns).toHaveLength(1);
    expect(d.turns[0]!.text).toBe('just words');
  });
});

describe('md', () => {
  it('parses headings, bullets, bold speakers and skips front matter', () => {
    const raw = '---\naccount: x\n---\n# QBR notes\n\n- **Dana:** wants SSO for the portal\n- Marcus: will follow up\n- plain bullet\n\nA paragraph\nthat wraps.';
    const d = parseDocument('n.md', raw);
    expect(d.turns.map((t) => t.speaker)).toEqual(['Notes', 'Dana', 'Marcus', 'Notes', 'Notes']);
    expect(d.turns[1]!.text).toBe('wants SSO for the portal');
    expect(d.turns[4]!.text).toBe('A paragraph that wraps.');
  });
  it('parses the friendly fixture', () => {
    const d = parseDocument('f.md', fixtureFile('friendly.md'));
    expect(d.format).toBe('md');
    expect(d.turns.length).toBe(4);
  });
});

describe('eml', () => {
  it('splits messages, strips quoting and assigns roles from the email domain', () => {
    const d = parseDocument('x.eml', fixtureFile('injection.eml'));
    expect(d.format).toBe('eml');
    expect(d.subject).toBe('RE: dashboard export');
    expect(d.turns[0]).toMatchObject({ speaker: 'Jordan Reyes', role: 'customer' });
    const last = d.turns[d.turns.length - 1]!;
    expect(last.speaker).toBe('Marcus Bell');
    expect(last.role).toBe('invoca');
    expect(last.text).toBe('Hi Jordan, any feedback on the new reports?');
  });
  it('handles forwarded messages', () => {
    const raw = 'From: Kim Lee <kim@acme.example>\nSubject: Fwd: pricing\n\nSee below.\n\n---------- Forwarded message ---------\nFrom: Pat Doe <pat@acme.example>\nDate: Mon, Oct 20, 2026\nSubject: pricing\n\nThe add-on is too expensive.';
    const d = parseDocument('f.eml', raw);
    expect(d.turns.map((t) => [t.speaker, t.text])).toEqual([['Kim Lee', 'See below.'], ['Pat Doe', 'The add-on is too expensive.']]);
  });
  it('extracts names from "wrote:" lines', () => {
    expect(wroteName('On Mon, Oct 20, 2026 at 4:02 PM Marcus Bell <marcus@invoca.example> wrote:')).toBe('Marcus Bell');
    expect(wroteName('On Tue, 21 Oct 2026, Dana Whitfield wrote:')).toBe('Dana Whitfield');
    expect(wroteName('On 10/21/2026 9:00 AM, someone at 555 wrote:')).toBe('unknown');
  });
});

describe('chat', () => {
  it('parses [time] handle: text', () => {
    const d = parseDocument('s.chat', fixtureFile('slack.chat'), { invocaNames: ['Marcus Bell'] });
    expect(d.turns.length).toBe(4);
    expect(d.turns[0]).toMatchObject({ speaker: 'dana.w', ts: '10:42:00', role: 'customer' });
    expect(d.turns[2]!.role).toBe('invoca');
  });
  it('parses other chat shapes, Slack header lines and 12h → 24h times', () => {
    const raw = 'dana.w [2:05 PM]: one\n14:06 marcus: two\n**dana**: three\nDana W  2:07 PM\nfour\nmore four';
    const d = parseDocument('c.chat', raw, { formatHint: 'chat' });
    expect(d.turns.map((t) => t.text)).toEqual(['one', 'two', 'three', 'four more four']);
    expect(d.turns[0]!.ts).toBe('14:05:00');
    expect(d.turns[3]!.ts).toBe('14:07:00');
  });
  it('a Slack export (.txt) parses one turn per message, with dated stamps, thread replies and section markers', () => {
    const raw = [
      'Slack export · #deal-sunpeak-renewal',
      'Exported 10/20/2026 12:06 PM · 4 messages',
      '',
      '[10/20/2026 11:20 AM] diego.alvarez: kicking off the renewal debrief here.',
      '[10/20/2026 11:22 AM] diego.alvarez: amanda wants the voice agent pricing restructured',
      '    ↳ [10/20/2026 11:24 AM] chris.donovan: so that is a 68k gap.',
      'continued on a second line',
      '--- #acct-sunpeak (internal, Invoca only) ---',
      '[10/20/2026 1:05 PM] chris.donovan: looping in finance',
    ].join('\n');
    const d = parseDocument('file_sunpeak_slack.txt', raw);
    expect(d.format).toBe('chat');
    const msgs = d.turns.filter((t) => t.speaker !== 'unknown');
    expect(msgs.map((t) => [t.speaker, t.ts])).toEqual([
      ['diego.alvarez', '11:20:00'], ['diego.alvarez', '11:22:00'], ['chris.donovan', '11:24:00'], ['chris.donovan', '13:05:00'],
    ]);
    expect(msgs[2]!.text).toBe('so that is a 68k gap. continued on a second line');
    expect(d.turns.some((t) => t.speaker === 'unknown' && t.text.startsWith('#acct-sunpeak'))).toBe(true);
  });
});

describe('assignRoles', () => {
  it('marks staff from the known-name list and the rest as customers', () => {
    const r = assignRoles([{ speaker: 'Priya' }, { speaker: 'Dana' }, { speaker: 'unknown' }], ['Priya Raman']);
    expect(r.map((x) => x.role)).toEqual(['invoca', 'customer', 'unknown']);
  });
});

describe('srt', () => {
  it('parses numbered cues with comma timings, "Speaker:" prefixes and formatting tags', () => {
    const raw = '1\n00:00:01,000 --> 00:00:04,000\nDana: the exports <i>keep</i> failing\n\n2\n00:00:05,500 --> 00:00:07,000\n{\\an8}and they are slow\n\n3\n00:01:02,000 --> 00:01:05,000\nMarcus: noted, I will log it\n';
    expect(detectFormat('call.srt', raw)).toBe('srt');
    expect(detectFormat('call', raw)).toBe('srt');
    const d = parseDocument('call.srt', raw, { invocaNames: ['Marcus Bell'] });
    expect(d.format).toBe('srt');
    expect(d.turns.map((t) => [t.speaker, t.ts, t.text])).toEqual([
      ['Dana', '00:00:01', 'the exports keep failing'],
      ['Dana', '00:00:05', 'and they are slow'],
      ['Marcus', '00:01:02', 'noted, I will log it'],
    ]);
    expect(d.turns[2]!.role).toBe('invoca');
  });
});

describe('doc (prose converted from PDF, DOCX, slides, HTML)', () => {
  const raw = [
    'Quarterly Business Review',
    '',
    'Brightline Home Services met with Invoca on October 21 to review call volume and',
    'attribution. The team raised concerns about how long offline conversions take.',
    '',
    'Pricing and Packaging',
    '',
    'Finance asked why PreSense is sold as an add-on.',
    '• They feel they are paying twice',
    '• They want one bundle at renewal',
    '',
    'Slide 4: Next steps',
    'Region\tOwner\tDue',
    'East\tMarcus\tNov 3',
  ].join('\n');
  it('splits prose into paragraphs, bullets and rows, labelled by the nearest heading', () => {
    const d = parseDocument('qbr.pdf', raw, { formatHint: 'doc' });
    expect(d.format).toBe('doc');
    const texts = d.turns.map((t) => t.text);
    expect(texts).toContain('Brightline Home Services met with Invoca on October 21 to review call volume and attribution. The team raised concerns about how long offline conversions take.');
    expect(d.turns.find((t) => t.text.startsWith('Finance asked'))!.speaker).toBe('Section · Pricing and Packaging');
    expect(d.turns.find((t) => t.text === 'They feel they are paying twice')!.speaker).toBe('Section · Pricing and Packaging');
    expect(d.turns.find((t) => t.text === 'Slide 4: Next steps')!.speaker).toBe('Document');
    expect(texts).toContain('East · Marcus · Nov 3');
    // Prose sections are not people: no roles, no "no speaker" warning.
    expect(d.turns.every((t) => t.role === 'unknown')).toBe(true);
    expect(d.warnings).toEqual([]);
    expect(detectFormat('deck.pptx', 'Title\n\nSome text')).toBe('doc');
  });
  it('a converted file that is really a transcript is read by speaker', () => {
    const d = parseDocument('call.pdf', 'Dana Whitfield: the exports fail\nMarcus Bell: noted\nDana Whitfield: also spam tagging\nMarcus Bell: ok', { formatHint: 'doc', invocaNames: ['Marcus Bell'] });
    expect(d.turns.map((t) => t.speaker)).toEqual(['Dana Whitfield', 'Marcus Bell', 'Dana Whitfield', 'Marcus Bell']);
    expect(d.turns[1]!.role).toBe('invoca');
  });
  it('a document with no paragraph breaks is cut into pieces, never one giant turn', () => {
    const blob = Array.from({ length: 400 }, (_, i) => `Sentence ${i} is about the reporting dashboard.`).join(' ');
    const d = parseDocument('wall.txt', blob);
    expect(d.turns.length).toBeGreaterThan(5);
    expect(d.turns.every((t) => t.text.length <= 1600)).toBe(true);
    expect(d.turns.map((t) => t.text).join(' ')).toBe(blob);
  });
});

describe('json exports', () => {
  it('Zoom / Gong / Teams-style transcripts [{speaker, text, start}]', () => {
    const raw = JSON.stringify([
      { speaker: 'Dana Whitfield', text: 'The offline conversions are late.', start: 4.2 },
      { speaker: 'Marcus Bell', text: 'How late?', start: 9 },
      { speaker: 'Dana Whitfield', text: 'Two to three days.', start: 72 },
    ]);
    expect(detectFormat('call.json', raw)).toBe('txt');
    const d = parseDocument('call.json', raw, { invocaNames: ['Marcus Bell'] });
    expect(d.turns.map((t) => [t.speaker, t.ts, t.text])).toEqual([
      ['Dana Whitfield', '00:00:04', 'The offline conversions are late.'],
      ['Marcus Bell', '00:00:09', 'How late?'],
      ['Dana Whitfield', '00:01:12', 'Two to three days.'],
    ]);
    expect(d.turns.map((t) => t.role)).toEqual(['customer', 'invoca', 'customer']);
    expect(d.warnings).toContain('read as a JSON transcript');
  });
  it('nested exports: Gong monologues with sentences, and wrapper objects', () => {
    const gong = JSON.stringify({ callTranscripts: [{ callId: '1', transcript: [{ speakerId: 'Dana', topic: 'x', sentences: [{ start: 1000, end: 2000, text: 'Spam tagging is wrong.' }, { start: 2000, end: 3000, text: 'Real callers.' }] }, { speakerId: 'Marcus', sentences: [{ start: 3000, text: 'Got it.' }] }] }] });
    const d = parseDocument('gong.json', gong);
    expect(d.turns.map((t) => [t.speaker, t.text])).toEqual([['Dana', 'Spam tagging is wrong. Real callers.'], ['Marcus', 'Got it.']]);
    const wrapped = parseDocument('x.json', JSON.stringify({ meta: { id: 1 }, segments: [{ participant: 'Ana', content: 'Hello there' }] }));
    expect(wrapped.turns[0]).toMatchObject({ speaker: 'Ana', text: 'Hello there' });
  });
  it('Slack exports [{user, text, ts}] read as chat, with markup cleaned', () => {
    const raw = JSON.stringify([
      { type: 'message', user: 'U02ABC', user_profile: { real_name: 'Dana Whitfield' }, text: 'exports fail again <@U03XYZ|marcus>', ts: '1729512345.004200' },
      { type: 'message', user: 'U03XYZ', text: 'see <https://status.example.com|status page>', ts: '1729512400.000100' },
    ]);
    expect(detectFormat('channel.json', raw)).toBe('chat');
    const d = parseDocument('channel.json', raw);
    expect(d.format).toBe('chat');
    expect(d.turns.map((t) => [t.speaker, t.text])).toEqual([['Dana Whitfield', 'exports fail again @marcus'], ['U03XYZ', 'see status page']]);
    expect(d.turns[0]!.ts).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    // A converter that passes the raw export through with a hint still gets JSON parsing.
    expect(parseDocument('channel.txt', raw, { formatHint: 'chat' }).turns).toHaveLength(2);
  });
  it('JSON with no message shape becomes document prose; invalid JSON is plain text', () => {
    const d = parseDocument('survey.json', JSON.stringify({ id: 9, answers: { q1: 'The reporting dashboard is too slow for our managers', q2: 'yes' } }));
    expect(d.format).toBe('doc');
    expect(d.turns.map((t) => t.text)).toEqual(['The reporting dashboard is too slow for our managers']);
    expect(parseDocument('broken.json', '{"speaker": "Dana", "text": oops').turns.length).toBeGreaterThan(0);
  });
});

describe('anything else', () => {
  it('garbage and binary residue never throw and still produce turns', () => {
    const noise = String.fromCharCode(...Array.from({ length: 200 }, (_, i) => (i * 37) % 256));
    const binary = `%PDF-1.7\n\u0000\u0001\u0002stream\u0007\u001b[0m xÿþ ${'�'.repeat(50)} endobj ${noise}`;
    const cases: [string, string, 'doc' | 'srt' | null][] = [['x.pdf', binary, 'doc'], ['x.bin', binary, null], ['x.json', '[[[[', null], ['x.srt', '1\n99:99', 'srt'], ['x.vtt', 'WEBVTT', null], ['x.eml', 'From:', null]];
    for (const [name, text, hint] of cases) {
      const d = parseDocument(name, text, { formatHint: hint });
      expect(Array.isArray(d.turns)).toBe(true);
      expect(d.turns.every((t) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t.text))).toBe(true);
    }
    expect(parseDocument('x.pdf', binary, { formatHint: 'doc' }).turns.length).toBeGreaterThan(0);
  });
  it('a 200k-character input parses quickly', () => {
    const big = Array.from({ length: 4000 }, (_, i) => `[00:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}] ${i % 2 ? 'Marcus' : 'Dana'}: line ${i} about exports and spam tagging`).join('\n');
    expect(big.length).toBeGreaterThan(150_000);
    const t0 = performance.now();
    const d = parseDocument('big.txt', big);
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(d.turns).toHaveLength(4000);
  });
});
