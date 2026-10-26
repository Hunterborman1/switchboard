// Browser-side conversion of uploaded files to text (src/app/lib/convert). Pure parts only:
// the Office converters run on zips built here with fflate; PDF is covered by the e2e upload.
import { strToU8, zipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertFile, ConvertError, MAX_TEXT_CHARS, pagesLabel } from '../../../src/app/lib/convert';
import { officeToText } from '../../../src/app/lib/convert/office';
import { delimitedToText, emlToText, htmlToText, jsonToText, msgToText, rtfToText, sniffTextFormat } from '../../../src/app/lib/convert/text';
import { librarySource } from '../../../src/app/lib/source';

const file = (content: string | Uint8Array, name: string, type = '') => new File([content as BlobPart], name, { type });

async function convertError(f: File): Promise<ConvertError> {
  try {
    await convertFile(f);
  } catch (e) {
    if (e instanceof ConvertError) return e;
    throw e;
  }
  throw new Error('expected a ConvertError');
}

describe('JSON exports', () => {
  it('reads a Zoom/Gong-style transcript as timed speaker lines', () => {
    const r = jsonToText(JSON.stringify([
      { speaker: 'Dana (Brightline)', text: 'Our conversions land two days late.', start: 72 },
      { speaker: 'Marcus', text: 'Which campaigns?', start: 90.5 },
    ]))!;
    expect(r.formatHint).toBe('txt');
    expect(r.label).toBe('Transcript (JSON)');
    expect(r.text).toBe('[00:01:12] Dana (Brightline): Our conversions land two days late.\n[00:01:30] Marcus: Which campaigns?');
  });

  it('names Gong monologues from the parties list', () => {
    const r = jsonToText(JSON.stringify({
      parties: [{ speakerId: '111', name: 'Dana Whitfield' }],
      callTranscripts: [{ callId: 'c1', transcript: [{ speakerId: '111', sentences: [{ start: 460230, text: 'The export times out.' }, { start: 462000, text: 'Every time.' }] }] }],
    }))!;
    expect(r.label).toBe('Gong transcript (JSON)');
    expect(r.text).toBe('[00:07:40] Dana Whitfield: The export times out. Every time.');
  });

  it('reads every Gong offset as milliseconds, including the first seconds of the call', () => {
    // Regression: offsets under 36,000 were read as seconds, so a sentence at 3,000 ms became 00:50:00.
    const r = jsonToText(JSON.stringify({
      parties: [{ speakerId: '1', name: 'Diego Alvarez' }, { speakerId: '2', name: 'Priyanka Shah' }],
      callTranscripts: [{ callId: 'c2', transcript: [
        { speakerId: '1', sentences: [{ start: 3000, end: 7000, text: 'Thanks for making time.' }] },
        { speakerId: '2', sentences: [{ start: 9000, end: 14000, text: 'The Salesforce sync duplicates contacts.' }] },
        { speakerId: '2', sentences: [{ start: 66000, end: 70000, text: 'My CFO will ask about it at renewal.' }] },
      ] }],
    }))!;
    expect(r.text).toBe(
      ['[00:00:03] Diego Alvarez: Thanks for making time.', '[00:00:09] Priyanka Shah: The Salesforce sync duplicates contacts.', '[00:01:06] Priyanka Shah: My CFO will ask about it at renewal.'].join('\n'),
    );
  });

  it('keeps small numeric offsets as seconds when nothing says milliseconds', () => {
    const r = jsonToText(JSON.stringify([{ speaker: 'Dana', text: 'Hello there.', start: 3000 }, { speaker: 'Marcus', text: 'Hi.', start: 3004 }]))!;
    expect(r.text.split('\n')[0]).toBe('[00:50:00] Dana: Hello there.');
  });

  it('keeps a transcript export’s title as the first line (it usually names the account)', () => {
    const r = jsonToText(JSON.stringify({ meeting_id: 1, topic: 'Prairie Link Broadband x Invoca check-in', timeline: [{ username: 'Ruth Calder', text: 'Our new numbers show as spam.', ts: '00:00:11.000' }] }))!;
    expect(r.text).toBe(['Prairie Link Broadband x Invoca check-in', '[00:00:11] Ruth Calder: Our new numbers show as spam.'].join('\n'));
    const gong = jsonToText(JSON.stringify({ metaData: { title: 'Atlas renewal' }, callTranscripts: [{ transcript: [{ speakerId: '1', sentences: [{ start: 1000, text: 'Hi.' }] }] }] }))!;
    expect(gong.text.split('\n')[0]).toBe('Atlas renewal');
  });

  it('reads a Slack export as chat lines', () => {
    const r = jsonToText(JSON.stringify([
      { type: 'message', user: 'U1', user_profile: { real_name: 'Dana W' }, text: 'presence data vanishes on transfer <@U2|marcus>', ts: '1791900000.000100' },
      { type: 'message', user: 'U2', text: 'how many calls?', ts: '1791900060.000200' },
    ]))!;
    expect(r.formatHint).toBe('chat');
    expect(r.label).toBe('Slack export (JSON)');
    expect(r.text.split('\n')[0]).toMatch(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] Dana W: presence data vanishes on transfer @marcus$/);
    expect(r.text.split('\n')[1]).toMatch(/\] U2: how many calls\?$/);
  });

  it('reads a Zoom timeline as a transcript, not a chat', () => {
    const r = jsonToText(JSON.stringify({ meeting_id: 1, timeline: [{ username: 'Dana Whitfield', text: 'The export times out.', ts: '00:01:12.000' }] }))!;
    expect(r).toMatchObject({ formatHint: 'txt', label: 'Zoom transcript (JSON)', text: '[00:01:12] Dana Whitfield: The export times out.' });
  });

  it('reads {from, text, ts} messages as a chat export', () => {
    const r = jsonToText(JSON.stringify({ messages: [{ from: 'dana', text: 'hi there', ts: '2026-10-12T14:05:00Z' }] }))!;
    expect(r.formatHint).toBe('chat');
    expect(r.text).toBe('[2026-10-12 14:05] dana: hi there');
  });

  it('turns any other JSON into readable key: value lines', () => {
    const r = jsonToText(JSON.stringify({ account: { name: 'Brightline', tier: 'Elite' }, tags: ['renewal', 'pricing'], score: 3 }))!;
    expect(r.formatHint).toBe('doc');
    expect(r.label).toBe('JSON data');
    expect(r.text).toBe('Account name: Brightline\nAccount tier: Elite\nTags: renewal, pricing\nScore: 3');
  });

  it('returns null for text that is not JSON', () => {
    expect(jsonToText('{ not json')).toBeNull();
  });
});

describe('CSV and TSV', () => {
  it('reads speaker and text columns as a transcript', () => {
    const r = delimitedToText('Start,Speaker,Text\n12,Dana,"We need the export, badly"\n30,Marcus,"Got it ""today"""\n', 'csv');
    expect(r.formatHint).toBe('txt');
    expect(r.label).toBe('Transcript (CSV)');
    expect(r.text).toBe('[00:00:12] Dana: We need the export, badly\n[00:00:30] Marcus: Got it "today"');
  });

  it('reads any other table as one row per line', () => {
    const r = delimitedToText('Account\tRating\tComment\nBrightline\t3\tSlow dashboard\n', 'tsv');
    expect(r.formatHint).toBe('doc');
    expect(r.label).toBe('Table (TSV)');
    expect(r.text).toBe('| Account | Rating | Comment |\n| Brightline | 3 | Slow dashboard |');
  });

  it('keeps newlines inside quoted fields and guesses semicolons', () => {
    const r = delimitedToText('Account;Status\nBrightline;"at risk\nsince Q3"\n', 'csv');
    expect(r.text).toBe('| Account | Status |\n| Brightline | at risk since Q3 |');
  });
});

describe('subtitles and plain text', () => {
  it('detects SRT, VTT, email headers and chat lines', () => {
    expect(sniffTextFormat('1\n00:00:01,000 --> 00:00:03,000\nHello there\n')).toBe('srt');
    expect(sniffTextFormat('WEBVTT\n\n00:01.000 --> 00:03.000\n<v Dana>Hi')).toBe('vtt');
    expect(sniffTextFormat('From: a@b.c\nTo: d@e.f\nSubject: hi\n\nbody')).toBe('eml');
    expect(sniffTextFormat(readFileSync('tests/fixtures/files/slack.chat', 'utf8'), 'txt')).toBe('chat');
    expect(sniffTextFormat('Just some notes about the call.\nNothing structured.')).toBe('txt');
  });

  it('passes an SRT file through with its hint and label', async () => {
    const srt = '1\n00:00:01,000 --> 00:00:04,000\nDana: The transfer drops the presence data.\n\n2\n00:00:05,000 --> 00:00:07,000\nMarcus: Since when?\n';
    const r = await convertFile(file(srt, 'call.srt'));
    expect(r).toMatchObject({ formatHint: 'srt', sourceFormat: 'srt', label: 'Transcript (SRT)', warnings: [] });
    expect(r.text).toContain('The transfer drops the presence data.');
  });

  it('labels a speaker-line text file as a transcript', async () => {
    const r = await convertFile(file(readFileSync('tests/fixtures/files/meridian-phi.txt'), 'meridian.txt'));
    expect(r.label).toBe('Transcript (text)');
    expect(r.sourceFormat).toBe('txt');
  });
});

describe('HTML', () => {
  it('keeps headings, paragraphs, lists and table rows; drops scripts and styles', () => {
    const { text, title } = htmlToText(`<!doctype html><html><head><title>QBR &amp; notes</title><style>p{color:red}</style></head>
      <body><h1>Brightline   QBR</h1><p>Conversions land <b>two days</b> late.</p>
      <script>alert(1)</script><ul><li>Export times out</li><li>Presence &mdash; lost</li></ul>
      <table><tr><th>Issue</th><th>Owner</th></tr><tr><td><p>Export</p></td><td>Product</td></tr></table></body></html>`);
    expect(title).toBe('QBR & notes');
    expect(text).toBe('# Brightline QBR\n\nConversions land two days late.\n\n- Export times out\n- Presence — lost\n\n| Issue | Owner |\n| Export | Product |');
  });
});

describe('RTF', () => {
  it('strips control words and hidden groups, keeps paragraphs and escapes', () => {
    const rtf = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}}{\colortbl;\red0\green0\blue0;}{\*\generator Riched20;}\f0\fs22 Dana said the export \b times out\b0 .\par Caf\'e9 ${'\\'}u8212? fine\par}`;
    expect(rtfToText(rtf)).toBe('Dana said the export times out.\n\nCafé — fine');
  });
});

describe('email', () => {
  it('reads MIME: decoded headers, the plain part over the HTML part', () => {
    const eml = [
      'From: =?UTF-8?B?Sm9yZGFuIFLDqXllcw==?= <jordan@sunpeak.example>',
      'To: Marcus <marcus@invoca.example>',
      'Subject: RE: dashboard export',
      'Date: Tue, 21 Oct 2026 09:14:00 -0700',
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="b1"',
      '',
      '--b1',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'We still can=E2=80=99t export the dashboard over 30 days.=',
      ' Thanks.',
      '--b1',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>HTML version</p>',
      '--b1--',
      '',
    ].join('\r\n');
    const r = emlToText(new TextEncoder().encode(eml));
    expect(r.label).toBe('Email thread');
    expect(r.formatHint).toBe('eml');
    expect(r.text).toBe('From: Jordan Réyes <jordan@sunpeak.example>\nTo: Marcus <marcus@invoca.example>\nDate: Tue, 21 Oct 2026 09:14:00 -0700\nSubject: RE: dashboard export\n\nWe still can’t export the dashboard over 30 days. Thanks.');
  });

  it('reads a base64 HTML-only email', () => {
    const html = btoa('<div>Presence data is lost on transfer.</div><div>Dana</div>');
    const eml = `From: dana@x.example\nSubject: issue\nContent-Type: text/html; charset=utf-8\nContent-Transfer-Encoding: base64\n\n${html}\n`;
    const r = emlToText(new TextEncoder().encode(eml));
    expect(r.label).toBe('Email');
    expect(r.text).toBe('From: dana@x.example\nSubject: issue\n\nPresence data is lost on transfer.\n\nDana');
  });

  it('pulls readable strings out of an Outlook .msg', () => {
    const utf16 = (s: string) => {
      const b = new Uint8Array(s.length * 2);
      for (let i = 0; i < s.length; i++) b[i * 2] = s.charCodeAt(i);
      return b;
    };
    const junk = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 3, 0]);
    const body = utf16('Hi Marcus, the CSV export still times out on anything over thirty days.');
    const head = utf16('From: Jordan <j@x.example>\r\nSubject: export\r\nTo: Marcus <m@x.example>');
    const bytes = new Uint8Array([...junk, ...head, 0, 0, 1, 2, ...body, 0, 0]);
    const r = msgToText(bytes);
    expect(r.formatHint).toBe('eml');
    expect(r.text).toContain('Subject: export');
    expect(r.text).toContain('the CSV export still times out');
  });
});

describe('Office files', () => {
  const w = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;
  const para = (text: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

  it('reads a Word document: headings, paragraphs, tables, entities', async () => {
    const xml = w(
      para('Brightline QBR', 'Heading1') +
        para('Conversions land two days late &amp; nobody knows why.') +
        '<w:p><w:r><w:t>Split </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>runs</w:t></w:r><w:r><w:tab/><w:t>join.</w:t></w:r></w:p>' +
        '<w:tbl><w:tr><w:tc>' + para('Issue') + '</w:tc><w:tc>' + para('Owner') + '</w:tc></w:tr><w:tr><w:tc>' + para('Export') + '</w:tc><w:tc>' + para('Product') + '</w:tc></w:tr></w:tbl>',
    );
    const zip = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8(xml) });
    const r = await convertFile(file(zip, 'QBR notes.docx'));
    expect(r).toMatchObject({ formatHint: 'doc', sourceFormat: 'docx', label: 'Word document', warnings: [] });
    expect(r.text).toBe('# Brightline QBR\n\nConversions land two days late & nobody knows why.\n\nSplit runs join.\n\n| Issue | Owner |\n| Export | Product |');
  });

  it('reads a PowerPoint deck in presentation order, with titles and notes', () => {
    const slide = (title: string, body: string) =>
      `<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const zip = zipSync({
      'ppt/presentation.xml': strToU8('<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>'),
      'ppt/_rels/presentation.xml.rels': strToU8('<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>'),
      'ppt/slides/slide1.xml': strToU8(slide('Pricing', 'Seat price is too high')),
      'ppt/slides/slide2.xml': strToU8(slide('Agenda', 'Renewal and roadmap')),
      'ppt/slides/_rels/slide2.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="../notesSlides/notesSlide9.xml"/></Relationships>'),
      'ppt/notesSlides/notesSlide9.xml': strToU8('<p:notes xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Ask about churn risk</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>'),
    });
    const r = officeToText(zip, 'pptx');
    expect(r).toMatchObject({ label: 'PowerPoint deck', pages: 2, pagesUnit: 'slide' });
    expect(r.text).toBe('Slide 1: Agenda\n\nRenewal and roadmap\n\nSpeaker notes: Ask about churn risk\n\nSlide 2: Pricing\n\nSeat price is too high');
    expect(pagesLabel(r)).toBe('2 slides');
  });

  it('reads an Excel workbook with shared and inline strings; a transcript sheet reads as one', () => {
    const zip = zipSync({
      'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="Calls" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8('<sst><si><t>Speaker</t></si><si><t>Text</t></si><si><r><t>Da</t></r><r><t>na</t></r></si><si><t>Export is slow</t></si></sst>'),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Marcus</t></is></c><c r="C3"><v>42</v></c><c r="B3" t="inlineStr"><is><t>Noted</t></is></c></row></sheetData></worksheet>',
      ),
    });
    const r = officeToText(zip, 'xlsx');
    expect(r).toMatchObject({ formatHint: 'doc', label: 'Transcript (Excel)', pages: 1, pagesUnit: 'sheet' });
    expect(r.text).toBe('Dana: Export is slow\nMarcus: Noted');
  });

  it('reads OpenDocument text: headings, spaces, lists; skips notes', () => {
    const xml =
      '<office:document-content xmlns:office="o" xmlns:text="t"><office:body><office:text>' +
      '<text:h text:outline-level="2">Next steps</text:h>' +
      '<text:p>Fix<text:s text:c="2"/>the export<text:note><text:note-body><text:p>hidden footnote</text:p></text:note-body></text:note>.</text:p>' +
      '<text:list><text:list-item><text:p>Call Dana</text:p></text:list-item></text:list>' +
      '</office:text></office:body></office:document-content>';
    const r = officeToText(zipSync({ mimetype: strToU8('application/vnd.oasis.opendocument.text'), 'content.xml': strToU8(xml) }), 'odt');
    expect(r.text).toBe('## Next steps\n\nFix the export.\n\n- Call Dana');
  });

  it('explains a damaged or protected Office file', async () => {
    const e = await convertError(file(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'deck.pptx'));
    expect(e.code).toBe('unreadable');
  });
});

describe('limits and refusals', () => {
  it('refuses audio, video and images with a clear next step', async () => {
    const audio = await convertError(file(new Uint8Array([1, 2, 3]), 'call.mp3', 'audio/mpeg'));
    expect(audio.code).toBe('media');
    expect(audio.title).toBe('Audio and video need a transcript');
    expect(audio.message).toMatch(/Connect Gong or Zoom, or upload the transcript file/);
    expect((await convertError(file(new Uint8Array([1]), 'screen.png', 'image/png'))).code).toBe('media');
  });

  it('refuses empty, too-short, legacy and binary files', async () => {
    expect((await convertError(file('', 'empty.txt'))).code).toBe('empty');
    expect((await convertError(file('hi there', 'short.txt'))).code).toBe('too_short');
    expect((await convertError(file(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0]), 'old.doc'))).title).toBe('Older Office files can’t be read');
    expect((await convertError(file(new Uint8Array([0, 1, 2, 0, 0, 9, 8]), 'blob.bin'))).code).toBe('unsupported');
  });

  it('cuts text over the limit on a line boundary and says so', async () => {
    const line = 'Dana: the export times out on anything over thirty days, every single time.\n';
    const big = line.repeat(Math.ceil((MAX_TEXT_CHARS * 1.3) / line.length));
    const r = await convertFile(file(big, 'huge.txt'));
    expect(r.text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    expect(r.text.endsWith('every single time.')).toBe(true);
    expect(r.warnings[0]).toMatch(/^This file has [\d,]+ characters of text\. Only the first [\d,]+ will be processed\.$/);
  });

  it('falls back to plain text for invalid JSON, with a warning', async () => {
    const r = await convertFile(file('{ "broken": true, this is not json but has enough characters', 'x.json'));
    expect(r.warnings).toEqual(['This isn’t valid JSON, so it was read as plain text.']);
  });
});

describe('library sources', () => {
  it('follows the backend mapping', () => {
    expect(librarySource({ filename: 'GMT20261009-183011_PrairieLink-QBR.transcript.vtt', format: 'vtt' })).toBe('zoom');
    expect(librarySource({ filename: 'x.eml', format: 'eml' })).toBe('gmail');
    expect(librarySource({ filename: 'slack-export_x.txt', format: 'chat' })).toBe('slack');
    expect(librarySource({ filename: 'notes.md', format: 'md' })).toBe('google_drive');
  });
});
