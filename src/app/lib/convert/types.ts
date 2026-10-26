/**
 * Shared shapes for the browser-side converter: any uploaded file becomes plain text plus a
 * parser hint for the pipeline. Nothing here touches the DOM, so it runs in node tests too.
 */
import type { FileFormat } from '../../../shared/contracts';

export type ConvertResult = {
  /** Extracted text, normalised and capped at MAX_TEXT_CHARS. */
  text: string;
  /** Parser hint sent with the run (src/pipeline/parse.ts reads it). */
  formatHint: FileFormat;
  /** Original file type before conversion: pdf, docx, json, … (shared/platform SOURCE_FORMATS). */
  sourceFormat: string;
  /** What a person would call it: "PDF document", "Zoom transcript (JSON)", "Email thread". */
  label: string;
  /** Pages, slides or sheets, when the format has them. */
  pages?: number;
  pagesUnit?: 'page' | 'slide' | 'sheet';
  /** Things the person should know (truncated, skipped parts). Plain sentences. */
  warnings: string[];
};

/** What a single converter returns before the shared post-processing (normalise, cap, check). */
export type Converted = Omit<ConvertResult, 'warnings' | 'sourceFormat'> & { warnings?: string[] };

export type ConvertErrorCode = 'empty' | 'too_short' | 'too_large' | 'media' | 'unsupported' | 'unreadable' | 'encrypted' | 'no_text';

/** A file that cannot become text. `title` and `message` are written for the person. */
export class ConvertError extends Error {
  readonly code: ConvertErrorCode;
  readonly title: string;
  constructor(code: ConvertErrorCode, title: string, message: string) {
    super(message);
    this.name = 'ConvertError';
    this.code = code;
    this.title = title;
  }
}

/** The run contract accepts up to 200,000 characters of text. */
export const MAX_TEXT_CHARS = 200_000;
/** The run contract needs at least 40 characters. */
export const MIN_TEXT_CHARS = 40;
/** Files larger than this are not read at all (the text would be far over the cap anyway). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
