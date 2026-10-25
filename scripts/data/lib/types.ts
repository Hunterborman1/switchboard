/** Types for scenario cards and generation output (data build only). */
import type { EdgeKind, FileFormat, InsightType, LibraryFile, MessLevel, ProductArea, Severity } from '../../../src/shared/contracts.ts';

export type Part = 'transcript' | 'notes' | 'email' | 'slack' | 'dump';

export type PlantedInsight = {
  type: InsightType;
  productArea: ProductArea;
  severity: Severity;
  summary: string;
  /** Featured cards: the verbatim line the generator must include. Backfill: '' (the generator reports it). */
  quote: string;
  /** Who says or writes it. */
  speaker?: string;
  /** Where it lives in mixed (level 5 / email) files. */
  part?: Part;
  /** Backfill only: an angle so 30 files about one theme don't read alike. */
  angle?: string;
  /** Backfill only: theme seed id. */
  themeId?: string;
};

export type Attendee = { name: string; org: 'customer' | 'invoca'; title: string; email?: string };

/** How the generator should shape its output. */
export type GenKind = 'notes_md' | 'transcript' | 'email_thread' | 'chaos_eml' | 'chaos_chat' | 'chaos_dump';

/** How the renderer lays out the final bytes. */
export type RenderStyle =
  | 'md'
  | 'vtt_zoom' // Zoom-style cues: "Name: text"
  | 'vtt_asr' // raw cues chunked by ~10 words, "Speaker N:" labels
  | 'txt_bracket' // [00:01:12] Name: text
  | 'txt_otter' // Name  1:12 \n text
  | 'txt_asr' // Speaker 1  00:01:12 \n text (lowercase, run-on)
  | 'eml'
  | 'chat_slack'
  | 'txt_dump';

export type Card = {
  fileId: string;
  accountId: string | null;
  callType: string;
  /** ISO 8601 with offset, local to the account. */
  startedAt: string;
  messLevel: MessLevel | null;
  edgeKind: EdgeKind | null;
  featured: boolean;
  tourPath: LibraryFile['tourPath'];
  recommended: boolean;
  filename: string;
  folder: string;
  format: FileFormat;
  kind: GenKind;
  render: RenderStyle;
  /** Corruption level applied after generation (1–2 = none). */
  corruptLevel: number;
  attendees: Attendee[];
  language: 'en' | 'es';
  targetWords: number;
  /** Situation, what happens, tone. The generator's main instruction. */
  brief: string;
  insights: PlantedInsight[];
  /** Neutral, non-insight content to include (counter-examples, tangents). */
  distractors?: string[];
  /** Other lines that must appear verbatim (injection text, PHI). */
  verbatim?: string[];
  phiTokens?: string[];
  expectActionable: boolean;
  expectInjectionFlag: boolean;
  /** Featured quotes are planted; backfill quotes are reported by the generator. */
  quoteMode: 'planted' | 'reported';
  /** Exact byte copy of another file. */
  duplicateOf?: string;
  /** Hand-written content (skips the generator). */
  handAuthored?: GenOutput;
  /** Fixed call id (only C-1042); the rest are assigned by date. */
  callId?: string;
};

export type GenTurn = { speaker: string; text: string };
export type GenEmail = {
  from: string;
  to: string[];
  cc?: string[];
  subject?: string;
  body: string;
  signature?: string;
  /** Minutes before the top-level file timestamp. */
  minutesBefore?: number;
};
export type GenSlackMessage = { user: string; text: string; minutesAfterStart?: number; threaded?: boolean };

export type GenOutput =
  | { kind: 'transcript'; turns: GenTurn[]; quotes?: string[] }
  | { kind: 'notes_md'; markdown: string; quotes?: string[] }
  | { kind: 'email_thread'; emails: GenEmail[]; quotes?: string[] }
  | { kind: 'chaos_eml'; forwardNote: string; emails: GenEmail[]; transcriptExcerpt: GenTurn[]; quotes?: string[] }
  | { kind: 'chaos_chat'; messages: GenSlackMessage[]; quotes?: string[] }
  | { kind: 'chaos_dump'; text: string; quotes?: string[] };
