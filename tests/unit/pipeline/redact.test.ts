import { describe, expect, it } from 'vitest';
import { detectPatterns, luhnValid, namesFromSpeakers, redactDocument, redactionSummary, ssnValid } from '../../../src/pipeline/redact.ts';
import type { RawTurn } from '../../../src/pipeline/types.ts';

const turn = (text: string, id = 't001'): RawTurn => ({ id, speaker: 'unknown', role: 'unknown', ts: null, text });
const red = (texts: string[], opts = {}) => redactDocument(texts.map((t, i) => turn(t, `t00${i + 1}`)), opts);

describe('validators', () => {
  it('luhn and SSN rules', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('1234')).toBe(false);
    expect(ssnValid('123-45-6789')).toBe(true);
    expect(ssnValid('000-12-3456')).toBe(false);
    expect(ssnValid('666-12-3456')).toBe(false);
    expect(ssnValid('912-12-3456')).toBe(false);
    expect(ssnValid('123-00-3456')).toBe(false);
  });
});

describe('pattern detectors', () => {
  it('emails, phones, cards, SSN, DOB, MRN, addresses', () => {
    const d = red(['Reach dana.w@brightline.example or (704) 555-0142 / +1 614.555.0199. Card 4111-1111-1111-1111. SSN 123-45-6789. DOB: 03/14/1962. MRN 4482913. Lives at 42 Maple Street, Apt 3B.']);
    const kinds = d.redactions.map((r) => r.kind).sort();
    expect(kinds).toEqual(['address', 'card', 'dob', 'email', 'mrn', 'phone', 'phone', 'ssn']);
    expect(d.text).not.toMatch(/555|4111|6789|1962|4482913|Maple/);
    expect(d.text).toContain('DOB: [DOB_1]');
  });
  it('rejects invalid numbers and leaves business numbers alone', () => {
    const d = red(['Order 4111-1111-1111-1112 shipped. Call 123-456-7890 and 000-12-3456. Ticket INTG-482, $250,000 ARR, 1,200 calls in Q3 2026.']);
    expect(d.redactions).toEqual([]);
    expect(d.text).toContain('4111-1111-1111-1112');
  });
  it('date of birth in words and patient names (any case)', () => {
    const d = red(['patient John Carter, date of birth March 3, 1950, born on 1950-03-03.', 'Patient Maria Gonzalez called.']);
    expect(d.redactions.filter((r) => r.kind === 'patient').length).toBe(2);
    expect(d.redactions.filter((r) => r.kind === 'dob').length).toBe(2);
    expect(d.text).toContain('[PATIENT_1]');
    expect(d.text).not.toMatch(/Carter|Gonzalez|1950/);
  });
  it('patient-adjacent product words are not names', () => {
    const d = red(['The patient Portal and patient intake flows are slow.']);
    expect(d.redactions).toEqual([]);
  });
});

describe('names', () => {
  it('redacts names from speaker labels everywhere, consistently, with aliases', () => {
    const turns: RawTurn[] = [
      { id: 't001', speaker: 'Dana Whitfield (Brightline)', role: 'customer', ts: null, text: 'Hi, Dana here.' },
      { id: 't002', speaker: 'Marcus (Invoca CSM)', role: 'invoca', ts: null, text: 'Thanks Dana. Whitfield is spelled right?' },
    ];
    const d = redactDocument(turns, { safeTerms: ['Brightline Home Services'] });
    expect(d.turns[0]!.speaker).toBe('[PERSON_1] (Brightline)');
    expect(d.turns[0]!.text).toBe('Hi, [PERSON_1] here.');
    expect(d.turns[1]!.text).toBe('Thanks [PERSON_1]. [PERSON_1] is spelled right?');
    expect(d.turns[1]!.speaker).toBe('[PERSON_2] (Invoca CSM)');
    expect(d.vault['[PERSON_1]']).toBe('Dana Whitfield');
  });
  it('honorifics, known names and first-name list with surnames', () => {
    const d = red(['Dr. Patel and Ms. Okafor met Priya Raman. Later Kevin Brooks joined.'], { knownNames: ['Priya Raman'] });
    expect(d.text).toBe('Dr. [PERSON_1] and Ms. [PERSON_2] met [PERSON_3]. Later [PERSON_4] joined.');
  });
  it('never touches product, competitor, partner or company names', () => {
    const text = 'Signal AI and PreSense sync to Google Ads, Salesforce, Genesys, Five9 and Adobe. CallRail, Marchex and WhatConverts pitched us. Will the Mark II report grant May access?';
    const d = red([text], { safeTerms: ['Brightline Home Services', 'Charlotte'] });
    expect(d.text).toBe(text);
    expect(d.redactions).toEqual([]);
  });
  it('safe terms protect cities and account names that look like first names', () => {
    const d = red(['How is Charlotte? Jordan said hi.'], { safeTerms: ['Charlotte'] });
    expect(d.text).toBe('How is Charlotte? [PERSON_1] said hi.');
  });
  it('chat handles are masked whole (first.last, @first.last, first_last, first.l), never half', () => {
    const turns: RawTurn[] = [
      { id: 't1', speaker: 'diego.alvarez', role: 'invoca', ts: null, text: 'cc @chris.donovan and chris_donovan; ping dana.w too. Diego Alvarez owns it. see export.csv on v4.1' },
      { id: 't2', speaker: 'chris.donovan', role: 'invoca', ts: null, text: 'thanks diego.alvarez, mail chris.donovan@invoca.com' },
    ];
    const d = redactDocument(turns, { knownNames: ['Diego Alvarez', 'Chris Donovan'] });
    expect(d.text).not.toMatch(/alvarez|donovan|diego|chris/i);
    expect(d.text).not.toMatch(/\]\.[a-z]|\][_.][a-z]|[a-z][._]\[/i);
    expect(d.text).not.toContain('dana.w');
    expect(d.text).toContain('export.csv');
    expect(d.text).toContain('v4.1');
    // One person, one token: the handle, the @handle, the underscore form and the full name.
    const t1 = d.turns[0]!;
    const tokens = t1.text.match(/\[PERSON_\d+\]/g)!;
    expect(new Set(tokens).size).toBe(3); // chris (×2 forms), dana, diego (full name)
    expect(tokens).toContain(t1.speaker); // "Diego Alvarez" is the speaker diego.alvarez
    expect(d.turns[1]!.text).toMatch(/thanks \[PERSON_\d+\], mail \[EMAIL_\d+\]/);
  });

  it('generic labels are not names', () => {
    expect(namesFromSpeakers(['Speaker 1', 'CSM', 'Customer', 'unknown', 'Dana (Acme)', 'dana@x.com', 'Notes'])).toEqual(['Dana']);
  });
});

describe('document', () => {
  it('turn offsets index the joined redacted document', () => {
    const d = red(['call me at 704-555-0142', 'second turn', 'email a@b.example']);
    for (const t of d.turns) expect(d.text.slice(t.start, t.end)).toBe(t.text);
    expect(d.text.split('\n')).toHaveLength(3);
  });
  it('numbers tokens in order of first use and counts occurrences', () => {
    const d = red(['Jordan and Kevin', 'Kevin again']);
    expect(d.text).toBe('[PERSON_1] and [PERSON_2]\n[PERSON_2] again');
    expect(d.redactions.find((r) => r.token === '[PERSON_2]')!.count).toBe(2);
  });
  it('previews are masked and never equal the original', () => {
    const d = red(['dana.whitfield@brightline.example, 704-555-0142, card 4111 1111 1111 1111, Jordan Reyes']);
    for (const r of d.redactions) {
      expect(r.preview).toContain('•');
      expect(r.preview).not.toBe(d.vault[r.token]);
    }
    expect(JSON.stringify(d.redactions)).not.toMatch(/whitfield|0142|Reyes/);
  });
  it('summaries count PHI separately', () => {
    const d = red(['Patient Maria Gonzalez DOB 03/14/1962 MRN 4482913']);
    expect(redactionSummary(d.redactions)).toMatch(/Redacted 3 values .*· 3 PHI/);
    expect(redactionSummary([])).toBe('No personal data found');
  });
  it('detectPatterns finds spans with exact offsets', () => {
    const s = 'x 704-555-0142 y';
    const [p] = detectPatterns(s);
    expect(s.slice(p!.start, p!.end)).toBe('704-555-0142');
  });
});
