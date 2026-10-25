/**
 * Name-detector guards: everyday words and form-field labels are never people, lower-case
 * first names in chat exports are, and grounding still works on the redacted text.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groundQuote } from '../../../src/pipeline/ground.ts';
import { parseDocument } from '../../../src/pipeline/parse.ts';
import { namesFromSpeakers, redactDocument } from '../../../src/pipeline/redact.ts';
import type { RawTurn } from '../../../src/pipeline/types.ts';

const file = (name: string) => readFileSync(new URL(`../../../data/files/${name}`, import.meta.url), 'utf8');
const t = (speaker: string, text: string, id: string): RawTurn => ({ id, speaker, role: 'unknown', ts: null, text });

describe('speaker labels must look like names', () => {
  it('rejects note headings and survey field labels', () => {
    expect(namesFromSpeakers(['Half-remembered from last call', 'Role', 'NPS', 'Comment', 'GM comparison', 'Also', 'Score', 'Subject', '--- pasted below'])).toEqual([]);
  });
  it('keeps real names, handles and lower-case listed first names', () => {
    expect(namesFromSpeakers(['Dana Whitfield', "Sean O'Brien", 'Ludwig van Beethoven', 'diego.alvarez', 'cody', 'Priyanka'])).toEqual(['Dana Whitfield', "Sean O'Brien", 'Ludwig van Beethoven', 'diego.alvarez', 'cody', 'Priyanka']);
  });
  it('a bad label never turns its words into name aliases', () => {
    const d = redactDocument([t('Half-remembered from last call', 'Mike said something.', 't001'), t('Comment', 'Google Ads conversions from calls show up two days late.', 't002')]);
    expect(d.text).toContain('Google Ads conversions from calls show up two days late.');
    expect(d.turns[1]!.speaker).toBe('Comment');
    expect(Object.values(d.vault)).toEqual(['Mike']);
  });
});

describe('the injection call-prep file', () => {
  const content = file('file_ridgeway_prep_injection.txt');
  const parsed = parseDocument('ridgeway_call-prep + survey export.txt', content, { invocaNames: ['Diego Alvarez'] });
  const doc = redactDocument(parsed.turns, { knownNames: ['Diego Alvarez'], safeTerms: ['Ridgeway', 'Ridgeway Motor Group', 'Google Ads', 'Marchex', 'Invoca', 'Salesforce', 'Signal AI'] });

  it('redacts the people and nothing else', () => {
    expect(new Set(Object.values(doc.vault))).toEqual(new Set(['Brittany', 'Mike', 'Diego Alvarez', 'diego.alvarez@invoca.example']));
    expect(doc.text).toContain('Google Ads conversions from calls show up two days late');
    expect(doc.text).toContain("'s comment is the real one");
    expect(doc.text).toContain('want the last 30 days');
    expect(doc.text).not.toMatch(/Brittany|Mike|Diego/);
  });

  it('grounding still finds a verbatim quote in the redacted text', () => {
    const ev = groundQuote('Google Ads conversions from calls show up two days late', null, doc.text, doc.turns);
    expect(ev.method).toBe('exact');
    const ev2 = groundQuote("[PERSON_1]'s comment is the real one", null, doc.text, doc.turns);
    expect(ev2.method).not.toBe('failed');
  });
});

describe('chat exports: lower-case first names', () => {
  it('masks listed first names typed in lower case, but not everyday words', () => {
    const turns = [t('diego.alvarez', 'call ran long, amanda, marisol & cody from sunpeak. frank feedback: miles of rob work, will do.', 't001')];
    const d = redactDocument(turns, { lowercaseFirstNames: true });
    expect(d.text).not.toMatch(/amanda|marisol|cody/);
    expect(d.text).toContain('frank feedback: miles of rob work, will do.');
    expect(d.text).toContain('from sunpeak');
  });
  it('is off by default (prose keeps lower-case words)', () => {
    const d = redactDocument([t('unknown', 'the amanda account notes', 't001')]);
    expect(d.text).toBe('the amanda account notes');
  });
  it('the SunPeak Slack export masks every customer first name', () => {
    const parsed = parseDocument('sunpeak_slack.txt', file('file_sunpeak_slack.txt'), { formatHint: 'chat' });
    const d = redactDocument(parsed.turns, { lowercaseFirstNames: parsed.format === 'chat', safeTerms: ['SunPeak', 'SunPeak Solar'] });
    expect(d.text).not.toMatch(/\b(amanda|marisol|cody|diego|kate|jordan)\b/i);
    expect(d.text).toContain('google ads');
  });
});

describe('addresses include the city that follows', () => {
  it('masks "street, city" in a PHI call, and the preview never shows the city', () => {
    const d = redactDocument([t('unknown', 'her home address, 2218 Belmont Boulevard, Nashville. She called later.', 't001')]);
    expect(d.text).toBe('her home address, [ADDRESS_1]. She called later.');
    expect(d.redactions[0]!.preview).toBe('••• Boulevard');
  });
  it('stops at a new clause and leaves a lone city alone', () => {
    const d = redactDocument([t('unknown', 'Ship to 42 Maple Street, Then call. Our HQ is in Nashville.', 't001')]);
    expect(d.text).toBe('Ship to [ADDRESS_1], Then call. Our HQ is in Nashville.');
  });
});
