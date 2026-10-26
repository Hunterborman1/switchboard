/**
 * Office files to text: Word (.docx), PowerPoint (.pptx), Excel (.xlsx) and OpenDocument text
 * (.odt). They are zip archives of XML; fflate unzips only the parts we read and a small tag
 * scanner walks the XML. No DOM, so the same code runs in node unit tests. Loaded lazily.
 */
import { strFromU8, unzipSync, type Unzipped } from 'fflate';
import { ConvertError, type Converted } from './types';
import { decodeEntities, tableToText } from './text';

export type OfficeKind = 'docx' | 'pptx' | 'xlsx' | 'odt';

// ---------------------------------------------------------------- xml scanning

type XmlHandler = {
  open?: (name: string, attrs: string, selfClosing: boolean) => void;
  close?: (name: string) => void;
  text?: (text: string) => void;
};

/** A forgiving SAX-style walk: opening and closing tags, text (entities decoded) and CDATA. */
export function scanXml(xml: string, h: XmlHandler): void {
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<[!?][\s\S]*?>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[6] !== undefined) h.text?.(decodeEntities(m[6]));
    else if (m[5] !== undefined) h.text?.(m[5]);
    else if (m[2]) {
      if (m[1]) h.close?.(m[2]);
      else {
        const self = m[4] === '/';
        h.open?.(m[2], m[3] ?? '', self);
        if (self) h.close?.(m[2]);
      }
    }
  }
}

export function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name.replace(/[.:]/g, '\\$&')}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? '') : null;
}

type Block = { text: string; row?: boolean };

/** Paragraphs joined by blank lines; consecutive table rows stay on adjacent lines. */
function joinBlocks(blocks: Block[]): string {
  let out = '';
  blocks.forEach((b, i) => {
    if (!b.text) return;
    if (out) out += b.row && blocks[i - 1]?.row ? '\n' : '\n\n';
    out += b.text;
  });
  return out;
}

const read = (zip: Unzipped, path: string): string | null => {
  const f = zip[path];
  return f ? strFromU8(f) : null;
};

/** Relationship id → part path, resolved against the folder of the part that owns the rels. */
function rels(zip: Unzipped, relsPath: string, baseDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const xml = read(zip, relsPath);
  if (!xml) return map;
  scanXml(xml, {
    open(name, a) {
      if (name !== 'Relationship') return;
      const id = attr(a, 'Id');
      const target = attr(a, 'Target');
      if (!id || !target || attr(a, 'TargetMode') === 'External') return;
      map.set(id, resolvePath(baseDir, target));
    },
  });
  return map;
}

function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const headingLevel = (style: string): number | null => {
  if (/^(title)$/i.test(style)) return 1;
  const m = /(?:heading|berschrift|titre|kop|rubrik)\s*(\d)/i.exec(style);
  return m ? Math.min(6, Number(m[1])) : null;
};

// ---------------------------------------------------------------- word

export function docxXmlToText(xml: string): string {
  const blocks: Block[] = [];
  let cur = '';
  let style = '';
  let list = false;
  let inT = false;
  let hidden = 0;
  let tableDepth = 0;
  let cells: string[] = [];
  let cellParts: string[] = [];
  scanXml(xml, {
    open(n, a, self) {
      switch (n) {
        case 'w:p':
          cur = '';
          style = '';
          list = false;
          break;
        case 'w:pStyle':
          style = attr(a, 'w:val') ?? '';
          break;
        case 'w:numPr':
          list = true;
          break;
        case 'w:t':
          inT = !self;
          break;
        case 'w:tab':
          if (self) cur += ' ';
          break;
        case 'w:br':
        case 'w:cr':
          if (self) cur += '\n';
          break;
        case 'w:noBreakHyphen':
          cur += '-';
          break;
        case 'w:tbl':
          tableDepth++;
          break;
        case 'w:tr':
          if (tableDepth === 1) cells = [];
          break;
        case 'w:tc':
          if (tableDepth === 1) cellParts = [];
          break;
        case 'w:instrText':
        case 'w:delText':
        case 'w:footnoteReference':
          if (!self) hidden++;
          break;
      }
    },
    text(t) {
      if (inT && !hidden) cur += t;
    },
    close(n) {
      switch (n) {
        case 'w:t':
          inT = false;
          break;
        case 'w:instrText':
        case 'w:delText':
        case 'w:footnoteReference':
          hidden = Math.max(0, hidden - 1);
          break;
        case 'w:p': {
          const line = cur
            .split('\n')
            .map((l) => l.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\n');
          cur = '';
          if (!line) break;
          if (tableDepth) cellParts.push(line.replace(/\n/g, ' '));
          else {
            const level = headingLevel(style);
            blocks.push({ text: level ? `${'#'.repeat(level)} ${line.replace(/\n/g, ' ')}` : list ? `- ${line}` : line });
          }
          break;
        }
        case 'w:tc':
          if (tableDepth === 1) cells.push(cellParts.join(' '));
          break;
        case 'w:tr':
          if (tableDepth === 1 && cells.some(Boolean)) blocks.push({ text: `| ${cells.join(' | ')} |`, row: true });
          break;
        case 'w:tbl':
          tableDepth = Math.max(0, tableDepth - 1);
          break;
      }
    },
  });
  return joinBlocks(blocks);
}

// ---------------------------------------------------------------- powerpoint

/** One slide's text: paragraphs from every shape; the title placeholder comes back separately. */
export function slideXmlToText(xml: string, opts: { notes?: boolean } = {}): { title: string; body: string[] } {
  let title = '';
  const body: string[] = [];
  let ph = '';
  let cur = '';
  let inT = false;
  let inShape = false;
  scanXml(xml, {
    open(n, a, self) {
      if (n === 'p:sp' || n === 'p:graphicFrame') {
        inShape = true;
        ph = '';
      } else if (n === 'p:ph') ph = attr(a, 'type') ?? 'body';
      else if (n === 'a:p') cur = '';
      else if (n === 'a:t') inT = !self;
      else if (n === 'a:br' && self) cur += '\n';
    },
    text(t) {
      if (inT) cur += t;
    },
    close(n) {
      if (n === 'a:t') inT = false;
      else if (n === 'a:p') {
        const line = cur.replace(/[ \t]+/g, ' ').trim();
        cur = '';
        if (!line || !inShape) return;
        if (opts.notes) {
          // notes pages repeat the slide image and number; only the notes body is wanted
          if (ph === 'body') body.push(line);
          return;
        }
        if ((ph === 'title' || ph === 'ctrTitle') && !title) title = line.replace(/\n/g, ' ');
        else if (ph !== 'sldNum' && ph !== 'dt' && ph !== 'ftr') body.push(line);
      } else if (n === 'p:sp' || n === 'p:graphicFrame') {
        inShape = false;
        ph = '';
      }
    },
  });
  return { title, body };
}

function pptxToText(zip: Unzipped): Converted {
  const presRels = rels(zip, 'ppt/_rels/presentation.xml.rels', 'ppt');
  const order: string[] = [];
  const pres = read(zip, 'ppt/presentation.xml');
  if (pres) {
    scanXml(pres, {
      open(n, a) {
        if (n !== 'p:sldId') return;
        const target = presRels.get(attr(a, 'r:id') ?? '');
        if (target && zip[target]) order.push(target);
      },
    });
  }
  if (!order.length) {
    const num = (p: string) => Number(/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0);
    order.push(
      ...Object.keys(zip)
        .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
        .sort((a, b) => num(a) - num(b)),
    );
  }
  const parts: string[] = [];
  order.forEach((path, i) => {
    const xml = read(zip, path);
    if (!xml) return;
    const { title, body } = slideXmlToText(xml);
    const slideDir = path.slice(0, path.lastIndexOf('/'));
    const slideRels = rels(zip, `${slideDir}/_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`, slideDir);
    const notesPath = [...slideRels.values()].find((p) => /notesSlide\d+\.xml$/.test(p));
    const notesXml = notesPath ? read(zip, notesPath) : null;
    const notes = notesXml ? slideXmlToText(notesXml, { notes: true }).body : [];
    const block = [`Slide ${i + 1}${title ? `: ${title}` : ''}`, ...body, ...(notes.length ? [`Speaker notes: ${notes.join(' ')}`] : [])];
    parts.push(block.join('\n\n'));
  });
  return { text: parts.join('\n\n'), formatHint: 'doc', label: 'PowerPoint deck', pages: order.length, pagesUnit: 'slide' };
}

// ---------------------------------------------------------------- excel

const colIndex = (ref: string): number => {
  const letters = /^[A-Z]+/i.exec(ref)?.[0]?.toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
};

export function sharedStrings(xml: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inT = false;
  let phonetic = 0;
  scanXml(xml, {
    open(n, _a, self) {
      if (n === 'si') cur = '';
      else if (n === 't') inT = !self;
      else if (n === 'rPh' && !self) phonetic++;
    },
    text(t) {
      if (inT && !phonetic) cur += t;
    },
    close(n) {
      if (n === 't') inT = false;
      else if (n === 'rPh') phonetic = Math.max(0, phonetic - 1);
      else if (n === 'si') out.push(cur);
    },
  });
  return out;
}

const MAX_ROWS = 20_000;

export function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  let row: string[] | null = null;
  let cellType = '';
  let cellCol = 0;
  let value = '';
  let inV = false;
  let inInline = false;
  scanXml(xml, {
    open(n, a, self) {
      if (n === 'row') row = [];
      else if (n === 'c') {
        cellType = attr(a, 't') ?? '';
        const ref = attr(a, 'r');
        cellCol = ref ? colIndex(ref) : (row?.length ?? 0);
        value = '';
      } else if (n === 'v') inV = !self;
      else if (n === 'is') inInline = !self;
      else if (n === 't' && inInline) inV = !self;
    },
    text(t) {
      if (inV) value += t;
    },
    close(n) {
      if (n === 'v' || (n === 't' && inInline)) inV = false;
      else if (n === 'is') inInline = false;
      else if (n === 'c' && row) {
        let text = value;
        if (cellType === 's') text = shared[Number(value)] ?? '';
        else if (cellType === 'b') text = value === '1' ? 'TRUE' : value === '0' ? 'FALSE' : value;
        if (text.trim() && cellCol < 200) {
          while (row.length < cellCol) row.push('');
          row[cellCol] = text.trim();
        }
      } else if (n === 'row' && row) {
        if (row.some((c) => c) && rows.length < MAX_ROWS) rows.push(row);
        row = null;
      }
    },
  });
  return rows;
}

function xlsxToText(zip: Unzipped): Converted {
  const shared = sharedStrings(read(zip, 'xl/sharedStrings.xml') ?? '');
  const bookRels = rels(zip, 'xl/_rels/workbook.xml.rels', 'xl');
  const sheets: { name: string; path: string }[] = [];
  const book = read(zip, 'xl/workbook.xml');
  if (book) {
    scanXml(book, {
      open(n, a) {
        if (n !== 'sheet') return;
        const path = bookRels.get(attr(a, 'r:id') ?? '');
        if (path && zip[path] && attr(a, 'state') !== 'hidden') sheets.push({ name: attr(a, 'name') ?? `Sheet ${sheets.length + 1}`, path });
      },
    });
  }
  if (!sheets.length) {
    for (const p of Object.keys(zip).filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort()) sheets.push({ name: `Sheet ${sheets.length + 1}`, path: p });
  }
  let transcript = false;
  const parts = sheets.flatMap((s) => {
    const rows = sheetRows(read(zip, s.path) ?? '', shared);
    if (!rows.length) return [];
    const t = tableToText(rows);
    transcript ||= t.transcript;
    return [sheets.length > 1 ? `# ${s.name}\n\n${t.text}` : t.text];
  });
  return { text: parts.join('\n\n'), formatHint: 'doc', label: 'Excel workbook', pages: sheets.length, pagesUnit: 'sheet', ...(transcript ? { label: 'Transcript (Excel)' } : {}) };
}

// ---------------------------------------------------------------- opendocument

export function odtXmlToText(xml: string): string {
  const blocks: Block[] = [];
  const stack: { text: string; level: number | null; list: boolean }[] = [];
  let listDepth = 0;
  let skip = 0;
  let tableDepth = 0;
  let cells: string[] = [];
  let cellParts: string[] = [];
  scanXml(xml, {
    open(n, a, self) {
      if (skip && !self && (n === 'text:note' || n === 'office:annotation')) skip++;
      else if (!self && (n === 'text:note' || n === 'office:annotation')) skip = 1;
      if (skip) return;
      switch (n) {
        case 'text:p':
        case 'text:h':
          if (!self) stack.push({ text: '', level: n === 'text:h' ? Number(attr(a, 'text:outline-level') ?? 1) || 1 : null, list: listDepth > 0 });
          break;
        case 'text:s': {
          const top = stack[stack.length - 1];
          if (top) top.text += ' '.repeat(Math.min(50, Number(attr(a, 'text:c') ?? 1) || 1));
          break;
        }
        case 'text:tab': {
          const top = stack[stack.length - 1];
          if (top) top.text += ' ';
          break;
        }
        case 'text:line-break': {
          const top = stack[stack.length - 1];
          if (top) top.text += '\n';
          break;
        }
        case 'text:list-item':
          if (!self) listDepth++;
          break;
        case 'table:table':
          if (!self) tableDepth++;
          break;
        case 'table:table-row':
          if (tableDepth === 1) cells = [];
          break;
        case 'table:table-cell':
          if (tableDepth === 1) cellParts = [];
          break;
      }
    },
    text(t) {
      const top = stack[stack.length - 1];
      if (!skip && top) top.text += t;
    },
    close(n) {
      if (skip) {
        if (n === 'text:note' || n === 'office:annotation') skip--;
        return;
      }
      switch (n) {
        case 'text:p':
        case 'text:h': {
          const p = stack.pop();
          if (!p) break;
          const line = p.text
            .split('\n')
            .map((l) => l.replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\n');
          if (!line) break;
          if (tableDepth) cellParts.push(line.replace(/\n/g, ' '));
          else if (stack.length) stack[stack.length - 1]!.text += ` ${line}`;
          else blocks.push({ text: p.level ? `${'#'.repeat(Math.min(6, p.level))} ${line.replace(/\n/g, ' ')}` : p.list ? `- ${line}` : line });
          break;
        }
        case 'text:list-item':
          listDepth = Math.max(0, listDepth - 1);
          break;
        case 'table:table-cell':
          if (tableDepth === 1) cells.push(cellParts.join(' '));
          break;
        case 'table:table-row':
          if (tableDepth === 1 && cells.some(Boolean)) blocks.push({ text: `| ${cells.join(' | ')} |`, row: true });
          break;
        case 'table:table':
          tableDepth = Math.max(0, tableDepth - 1);
          break;
      }
    },
  });
  return joinBlocks(blocks);
}

// ---------------------------------------------------------------- entry

const WANTED: Record<OfficeKind, RegExp> = {
  docx: /^(word\/document\.xml|\[Content_Types\]\.xml)$/,
  pptx: /^(ppt\/presentation\.xml|ppt\/_rels\/presentation\.xml\.rels|ppt\/slides\/slide\d+\.xml|ppt\/slides\/_rels\/slide\d+\.xml\.rels|ppt\/notesSlides\/notesSlide\d+\.xml)$/,
  xlsx: /^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/,
  odt: /^(content\.xml|mimetype)$/,
};

/** Which Office kind a zip is, from its entry names (for files with no useful extension). */
export function sniffOfficeKind(bytes: Uint8Array): OfficeKind | null {
  let names: string[] = [];
  try {
    unzipSync(bytes, {
      filter: (f) => {
        names.push(f.name);
        return f.name === 'mimetype';
      },
    });
  } catch {
    names = [];
  }
  if (names.includes('word/document.xml')) return 'docx';
  if (names.includes('ppt/presentation.xml')) return 'pptx';
  if (names.includes('xl/workbook.xml')) return 'xlsx';
  if (names.includes('content.xml')) return 'odt';
  return null;
}

export function officeToText(bytes: Uint8Array, kind: OfficeKind): Converted {
  let zip: Unzipped;
  try {
    zip = unzipSync(bytes, { filter: (f) => WANTED[kind].test(f.name) });
  } catch {
    throw new ConvertError('unreadable', 'This file can’t be opened', 'It may be damaged or password-protected. Save an unprotected copy, or export it as PDF, and upload that.');
  }
  switch (kind) {
    case 'docx': {
      const xml = read(zip, 'word/document.xml');
      if (!xml) throw new ConvertError('unreadable', 'This isn’t a Word document', 'The file has a .docx name but no document inside. Open it in Word and save it again.');
      return { text: docxXmlToText(xml), formatHint: 'doc', label: 'Word document' };
    }
    case 'pptx':
      if (!read(zip, 'ppt/presentation.xml') && !Object.keys(zip).some((p) => p.startsWith('ppt/slides/'))) {
        throw new ConvertError('unreadable', 'This isn’t a PowerPoint deck', 'The file has a .pptx name but no slides inside. Open it in PowerPoint and save it again.');
      }
      return pptxToText(zip);
    case 'xlsx':
      if (!read(zip, 'xl/workbook.xml')) throw new ConvertError('unreadable', 'This isn’t an Excel workbook', 'The file has an .xlsx name but no sheets inside. Open it in Excel and save it again.');
      return xlsxToText(zip);
    case 'odt': {
      const xml = read(zip, 'content.xml');
      if (!xml) throw new ConvertError('unreadable', 'This isn’t an OpenDocument file', 'The file has no document content inside. Open it and save it again.');
      return { text: odtXmlToText(xml), formatHint: 'doc', label: 'OpenDocument text' };
    }
  }
}
