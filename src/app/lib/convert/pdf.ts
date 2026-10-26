/**
 * PDF to text with pdf.js, in its own worker. Loaded lazily (index.ts imports this module only
 * when a PDF arrives), so pdf.js never lands in the main bundle. Lines are rebuilt from text
 * positions; a vertical gap larger than a line starts a new paragraph.
 */
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ConvertError, type Converted } from './types';

GlobalWorkerOptions.workerSrc = workerUrl;

function pageText(items: TextItem[]): string {
  let out = '';
  let lastY: number | null = null;
  let lastEnd = 0;
  let lineH = 0;
  let eol = false;
  for (const it of items) {
    const x = Number(it.transform[4]) || 0;
    const y = Number(it.transform[5]) || 0;
    const h = Math.abs(Number(it.transform[3])) || it.height || 10;
    if (lastY !== null) {
      const dy = Math.abs(lastY - y);
      const unit = Math.max(h, lineH);
      if (dy > unit * 0.5 || eol) {
        out = out.replace(/[ \t]+$/, '');
        out += dy > unit * 1.7 ? '\n\n' : '\n';
      } else if (it.str && !/\s$/.test(out) && !/^\s/.test(it.str) && x - lastEnd > h * 0.15) {
        out += ' ';
      }
    }
    out += it.str;
    eol = it.hasEOL;
    if (it.str.trim()) {
      lastY = y;
      lineH = h;
      lastEnd = x + (it.width || 0);
    }
  }
  return out;
}

export async function pdfToText(bytes: Uint8Array): Promise<Converted> {
  // pdf.js transfers the buffer to its worker; give it a copy.
  const task = getDocument({ data: bytes.slice(), disableFontFace: true, verbosity: VerbosityLevel.ERRORS });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(pageText(content.items.filter((x): x is TextItem => 'str' in x)));
      page.cleanup();
    }
    return { text: pages.join('\n\n'), formatHint: 'doc', label: 'PDF document', pages: doc.numPages, pagesUnit: 'page' };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'PasswordException') throw new ConvertError('encrypted', 'This PDF is password-protected', 'Remove the password (or print it to a new PDF) and upload that copy.');
    if (name === 'InvalidPDFException') throw new ConvertError('unreadable', 'This PDF can’t be read', 'The file looks damaged. Open it, save a new copy, and upload that.');
    throw new ConvertError('unreadable', 'This PDF can’t be read', err instanceof Error ? err.message : 'Open it, save a new copy, and upload that.');
  } finally {
    void task.destroy();
  }
}
