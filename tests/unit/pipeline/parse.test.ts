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
});

describe('assignRoles', () => {
  it('marks staff from the known-name list and the rest as customers', () => {
    const r = assignRoles([{ speaker: 'Priya' }, { speaker: 'Dana' }, { speaker: 'unknown' }], ['Priya Raman']);
    expect(r.map((x) => x.role)).toEqual(['invoca', 'customer', 'unknown']);
  });
});
