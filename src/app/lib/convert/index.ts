/**
 * Any uploaded file → text for the pipeline, in the browser. The file never leaves the browser
 * as-is: only the extracted text is sent (and redacted server-side before any AI sees it).
 *
 *   convertFile(file) → { text, formatHint, sourceFormat, label, pages?, warnings }
 *
 * Text formats are handled here; PDF (pdf.js) and Office/OpenDocument (fflate) converters are
 * imported on demand so they never weigh on the main bundle. Audio, video and images get a clear
 * "needs a transcript" answer instead of a failure. Text over MAX_TEXT_CHARS is cut on a line
 * boundary and the result says so in `warnings`.
 */
import { ConvertError, MAX_FILE_BYTES, MAX_TEXT_CHARS, MIN_TEXT_CHARS, type ConvertResult, type Converted } from './types';
import { capText, decodeTextFile, delimitedToText, emlToText, htmlToText, jsonToText, looksBinary, msgToText, normalizeText, plainText, rtfToText } from './text';

export { ConvertError, MAX_FILE_BYTES, MAX_TEXT_CHARS, MIN_TEXT_CHARS, type ConvertResult } from './types';

const AUDIO_VIDEO = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'wma', 'aif', 'aiff', 'amr', 'mp4', 'm4v', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'mpeg', 'mpg', '3gp']);
const IMAGES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg', 'ico', 'avif']);
const LEGACY_OFFICE = new Set(['doc', 'ppt', 'xls', 'pps', 'pot', 'dot', 'xlt']);
const APPLE = new Set(['pages', 'key', 'numbers']);
const TEXT_EXT = new Set(['txt', 'text', 'md', 'markdown', 'vtt', 'srt', 'log', 'chat']);

/** Accept list for the file input (everything the converter reads). */
export const ACCEPT = [
  '.pdf', '.docx', '.pptx', '.xlsx', '.odt', '.txt', '.md', '.markdown', '.vtt', '.srt', '.eml', '.msg', '.json', '.csv', '.tsv', '.html', '.htm', '.rtf', '.chat',
  'text/*', 'application/pdf', 'application/json', 'message/rfc822',
].join(',');

/** Human list for hints. */
export const SUPPORTED_SUMMARY = 'PDF, Word, PowerPoint, Excel, transcripts (VTT, SRT, JSON), email, chat exports, CSV, HTML and text';

export const extOf = (name: string): string => {
  const m = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return m ? m[1]!.toLowerCase() : '';
};

const fmt = (n: number) => n.toLocaleString('en-US');

/** Canonical source format (shared/platform SOURCE_FORMATS) for an extension. */
function sourceFormatOf(ext: string): string {
  if (ext === 'htm' || ext === 'xhtml') return 'html';
  if (ext === 'markdown') return 'md';
  if (ext === 'text' || ext === 'log' || !ext) return 'txt';
  if (ext === 'tsv') return 'csv';
  if (ext === 'msg') return 'eml';
  if (ext === 'docm' || ext === 'dotx') return 'docx';
  if (ext === 'ppsx' || ext === 'potx') return 'pptx';
  if (ext === 'xlsm') return 'xlsx';
  if (ext === 'ott') return 'odt';
  return ext.slice(0, 12);
}

function mediaError(ext: string, mime: string): ConvertError | null {
  if (AUDIO_VIDEO.has(ext) || mime.startsWith('audio/') || mime.startsWith('video/')) {
    return new ConvertError('media', 'Audio and video need a transcript', 'Connect Gong or Zoom, or upload the transcript file (VTT, SRT, JSON or text).');
  }
  if (IMAGES.has(ext) || mime.startsWith('image/')) {
    return new ConvertError('media', 'Images can’t be read', 'Switchboard reads text. Upload the original document, or paste the text.');
  }
  return null;
}

function unsupported(ext: string): ConvertError {
  if (LEGACY_OFFICE.has(ext)) return new ConvertError('unsupported', 'Older Office files can’t be read', 'Save it as .docx, .pptx or .xlsx (or as a PDF) and upload that.');
  if (APPLE.has(ext)) return new ConvertError('unsupported', 'Apple iWork files can’t be read', 'Export it as PDF or Word from Pages, Keynote or Numbers, then upload that.');
  return new ConvertError(
    'unsupported',
    ext ? `.${ext} files aren’t supported` : 'This file type isn’t supported',
    'Upload a PDF, a Word, PowerPoint or Excel file, a transcript, an email or chat export, or a text file.',
  );
}

const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04; // PK..

async function convertBytes(bytes: Uint8Array, ext: string, name: string, mime: string): Promise<{ result: Converted; sourceFormat: string }> {
  const as = (result: Converted, sourceFormat = sourceFormatOf(ext)) => ({ result, sourceFormat });
  const office = async (kind: 'docx' | 'pptx' | 'xlsx' | 'odt') => (await import('./office')).officeToText(bytes, kind);

  if (ext === 'pdf' || isPdf(bytes)) {
    if (!isPdf(bytes)) throw new ConvertError('unreadable', 'This PDF can’t be read', 'The file has a .pdf name but isn’t a PDF inside. Open it and save a new copy.');
    return as(await (await import('./pdf')).pdfToText(bytes), 'pdf');
  }
  switch (ext) {
    case 'docx':
    case 'docm':
    case 'dotx':
      return as(await office('docx'));
    case 'pptx':
    case 'ppsx':
    case 'potx':
      return as(await office('pptx'));
    case 'xlsx':
    case 'xlsm':
      return as(await office('xlsx'));
    case 'odt':
    case 'ott':
      return as(await office('odt'));
    case 'eml':
      return as(emlToText(bytes));
    case 'msg':
      return as(msgToText(bytes));
  }
  if (isZip(bytes)) {
    const { sniffOfficeKind } = await import('./office');
    const kind = sniffOfficeKind(bytes);
    if (kind) return as(await office(kind), kind);
    throw unsupported(ext || 'zip');
  }
  if (LEGACY_OFFICE.has(ext) || APPLE.has(ext)) throw unsupported(ext);
  if (looksBinary(bytes)) throw unsupported(ext);

  const text = decodeTextFile(bytes);
  switch (ext) {
    case 'json': {
      const r = jsonToText(text);
      if (r) return as(r);
      const fallback = plainText(text, 'txt', name);
      return as({ ...fallback, warnings: ['This isn’t valid JSON, so it was read as plain text.'] }, 'txt');
    }
    case 'csv':
    case 'tsv':
      return as(delimitedToText(text, ext === 'tsv' ? 'tsv' : 'csv'));
    case 'html':
    case 'htm':
    case 'xhtml':
      return as({ text: htmlToText(text).text, formatHint: 'doc', label: 'Web page' });
    case 'rtf':
      return as({ text: rtfToText(text), formatHint: 'doc', label: 'Rich text document' });
  }
  if (TEXT_EXT.has(ext) || mime.startsWith('text/') || !ext) {
    return as(plainText(text, ext, name), ext === 'chat' ? 'chat' : sourceFormatOf(ext));
  }
  // An unknown extension that is text: sniff it (JSON, HTML, RTF, or plain).
  const head = text.trimStart();
  if (/^[[{]/.test(head)) {
    const r = jsonToText(text);
    if (r) return as(r, 'json');
  }
  if (/^\{\\rtf/.test(head)) return as({ text: rtfToText(text), formatHint: 'doc', label: 'Rich text document' }, 'rtf');
  if (/^<(!doctype html|html|body|div|p)\b/i.test(head)) return as({ text: htmlToText(text).text, formatHint: 'doc', label: 'Web page' }, 'html');
  return as(plainText(text, ext, name), 'txt');
}

/** What to call `n` pages, slides or sheets. */
export function pagesLabel(r: Pick<ConvertResult, 'pages' | 'pagesUnit'>): string | null {
  if (!r.pages) return null;
  const unit = r.pagesUnit ?? 'page';
  return `${fmt(r.pages)} ${unit}${r.pages === 1 ? '' : 's'}`;
}

export async function convertFile(file: File): Promise<ConvertResult> {
  const ext = extOf(file.name);
  const mime = (file.type || '').toLowerCase();
  if (file.size === 0) throw new ConvertError('empty', 'This file is empty', 'Choose a file with some text in it.');
  const media = mediaError(ext, mime);
  if (media) throw media;
  if (file.size > MAX_FILE_BYTES) {
    throw new ConvertError('too_large', 'This file is too large', `It is ${(file.size / 1024 / 1024).toFixed(0)} MB; the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB. Split it, or upload the part you need.`);
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new ConvertError('unreadable', 'This file can’t be read', 'Your browser couldn’t open it. Check that it isn’t still downloading or locked, then try again.');
  }
  const { result, sourceFormat } = await convertBytes(bytes, ext, file.name, mime);
  const warnings = [...(result.warnings ?? [])];
  const text = normalizeText(result.text);
  if (!text) {
    if (sourceFormat === 'pdf') throw new ConvertError('no_text', 'This PDF has no text to read', 'It looks like a scan or images of pages. Upload a text version, or run it through OCR first.');
    throw new ConvertError('no_text', 'No text found', 'Switchboard couldn’t find any readable text in this file.');
  }
  if (text.length < MIN_TEXT_CHARS) {
    throw new ConvertError('too_short', 'Not enough text', `It has ${fmt(text.length)} characters of text; Switchboard needs at least ${MIN_TEXT_CHARS}.`);
  }
  const capped = capText(text, MAX_TEXT_CHARS);
  if (capped.truncated) warnings.push(`This file has ${fmt(text.length)} characters of text. Only the first ${fmt(capped.text.length)} will be processed.`);
  return {
    text: capped.text,
    formatHint: result.formatHint,
    sourceFormat,
    label: result.label,
    ...(result.pages ? { pages: result.pages, pagesUnit: result.pagesUnit ?? 'page' } : {}),
    warnings,
  };
}
