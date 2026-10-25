/**
 * Assembles the library: corrupts each clean generation to its level, renders the final file,
 * relocates every golden quote in the final bytes (build FAILS if one cannot be found), and
 * writes data/library.json, data/files/*, data/golden/*, plus a build report.
 *
 *   node --env-file=.env scripts/data/build.ts
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GoldenLabel, LibraryFile, type GoldenLabel as Golden, type LibraryFile as LFile } from '../../src/shared/contracts.ts';
import { corruptShorthand, corruptTurns, timeline } from './corrupt.ts';
import { GEN_DIR, type GenRecord } from './generate.ts';
import { createRng } from './lib/rng.ts';
import type { Card, GenOutput, GenTurn } from './lib/types.ts';
import { locateQuote } from './relocate.ts';
import { renderDump, renderEmail, renderNotes, renderSlack, renderTranscript } from './render.ts';
import { allCards, TOUR_FILES } from './scenarios.ts';
import { THEME_SEEDS } from './scenarios/backfill.ts';
import { applyEdits } from './scenarios/edits.ts';
import { accountById, DATA_DIR, resolveRoute, ROUTING } from './world.ts';

export type Built = { content: string; quotes: string[]; methods: string[]; scores: number[]; durationSec: number | null };

/** Find each clean quote inside the corrupted turns and return the exact turn-level spans. */
function protectedSpans(turns: GenTurn[], quotes: string[]): string[] {
  const spans: string[] = [];
  for (const q of quotes) {
    let best: { text: string; score: number } | null = null;
    for (const t of turns) {
      const loc = locateQuote(t.text, q, 0.6);
      if (loc && (!best || loc.score > best.score)) best = { text: loc.text, score: loc.score };
      if (best?.score === 1) break;
    }
    if (best) spans.push(best.text);
  }
  return spans;
}

export function buildFile(card: Card, rec: GenRecord): Built {
  const out = applyEdits(card.fileId, rec.output);
  const quotes = [...rec.quotes, ...(rec.extras ?? []).map((e) => e.quote)];
  const level = card.corruptLevel;
  let content: string;
  let spans: string[] = [];
  let durationSec: number | null = null;

  switch (out.kind) {
    case 'transcript': {
      const turns = corruptTurns(out.turns, level, card.fileId, quotes);
      spans = protectedSpans(turns, quotes);
      content = renderTranscript(card, turns, spans);
      const tl = timeline(turns, level, card.fileId);
      durationSec = (tl[tl.length - 1]?.end ?? 0) + 3;
      break;
    }
    case 'notes_md':
      content = renderNotes(out);
      break;
    case 'email_thread':
      content = renderEmail(card, out);
      break;
    case 'chaos_eml': {
      const o: GenOutput = {
        ...out,
        forwardNote: corruptShorthand(out.forwardNote, level, `${card.fileId}:fwd`, quotes),
        transcriptExcerpt: corruptTurns(out.transcriptExcerpt, Math.min(level, 4), `${card.fileId}:x`, quotes),
      };
      content = renderEmail(card, o);
      break;
    }
    case 'chaos_chat': {
      const o: GenOutput = { ...out, messages: out.messages.map((m, i) => ({ ...m, text: corruptShorthand(m.text, level, `${card.fileId}:${i}`, quotes) })) };
      content = renderSlack(card, o);
      break;
    }
    case 'chaos_dump':
      content = renderDump({ ...out, text: corruptShorthand(out.text, level, card.fileId, quotes) });
      break;
  }

  // Relocate: exact turn-level span first, then exact/normalized/fuzzy on the whole file.
  const final: string[] = [];
  const methods: string[] = [];
  const scores: number[] = [];
  quotes.forEach((q, i) => {
    const span = spans[i];
    if (span && content.includes(span)) {
      final.push(span);
      methods.push(span === q ? 'exact' : 'relocated');
      scores.push(1);
      return;
    }
    const loc = locateQuote(content, q, 0.7);
    if (!loc) throw new Error(`${card.fileId}: golden quote ${i + 1} not locatable after corruption: "${q}"`);
    final.push(loc.text);
    methods.push(loc.method === 'exact' ? 'exact' : `relocated-${loc.method}`);
    scores.push(loc.score);
  });
  return { content, quotes: final, methods, scores, durationSec };
}

function modifiedAt(card: Card, durationSec: number | null): string {
  const rng = createRng(`mtime:${card.fileId}`);
  const start = new Date(card.startedAt).getTime();
  let ms: number;
  if (card.render === 'eml') ms = start;
  else if (card.render === 'chat_slack') ms = start + rng.int(35, 240) * 60_000;
  else if (durationSec) ms = start + durationSec * 1000 + rng.int(2, 25) * 60_000;
  else ms = start + rng.int(20, 95) * 60_000;
  return new Date(Math.round(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

function ext(filename: string): string {
  return filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
}

export function run(): void {
  const cards = allCards();
  const filesDir = join(DATA_DIR, 'files');
  const goldenDir = join(DATA_DIR, 'golden');
  for (const d of [filesDir, goldenDir]) {
    if (existsSync(d)) rmSync(d, { recursive: true });
    mkdirSync(d, { recursive: true });
  }
  const library: LFile[] = [];
  const golden = new Map<string, Golden>();
  const contents = new Map<string, string>();
  const errors: string[] = [];
  const report: Record<string, unknown>[] = [];
  const backfillThemes: Record<string, string[]> = {};
  let extrasAdded = 0;

  const ordered = [...cards.filter((c) => !c.duplicateOf), ...cards.filter((c) => c.duplicateOf)];
  for (const card of ordered) {
    try {
      let built: Built;
      if (card.duplicateOf) {
        const src = contents.get(card.duplicateOf);
        const srcGolden = golden.get(card.duplicateOf);
        if (!src || !srcGolden) throw new Error(`duplicate source ${card.duplicateOf} missing`);
        built = { content: src, quotes: srcGolden.insights.map((i) => i.quote), methods: srcGolden.insights.map(() => 'duplicate'), scores: srcGolden.insights.map(() => 1), durationSec: null };
        const srcCard = cards.find((c) => c.fileId === card.duplicateOf) as Card;
        card.insights = srcCard.insights;
      } else {
        const file = join(GEN_DIR, `${card.fileId}.json`);
        if (!existsSync(file)) throw new Error('no generation (run generate.ts)');
        const rec = JSON.parse(readFileSync(file, 'utf8')) as GenRecord;
        built = buildFile(card, rec);
        // insights the audit found beyond the planted ones become part of the ground truth
        card.insights = [...card.insights, ...(rec.extras ?? []).map((e) => ({ type: e.type, productArea: e.productArea, severity: e.severity, summary: e.summary ? `${e.summary.charAt(0).toUpperCase()}${e.summary.slice(1)}` : e.quote, quote: e.quote, themeId: 'audit_extra' }))];
        extrasAdded += rec.extras?.length ?? 0;
      }
      for (const v of card.verbatim ?? []) if (!built.content.includes(v)) throw new Error(`verbatim line missing: "${v.slice(0, 60)}"`);
      for (const t of card.phiTokens ?? []) if (!built.content.includes(t)) throw new Error(`PHI token missing: "${t}"`);

      const account = card.accountId ? accountById(card.accountId) : null;
      const g: Golden = GoldenLabel.parse({
        fileId: card.fileId,
        expectActionable: card.expectActionable,
        expectInjectionFlag: card.expectInjectionFlag,
        insights: card.insights.map((ins, i) => ({
          type: ins.type,
          productArea: ins.productArea,
          severity: ins.severity,
          summary: ins.summary,
          quote: built.quotes[i] as string,
          owner: resolveRoute(ROUTING, ins, account?.arrBand ?? null).ownerId,
        })),
        phiTokens: card.phiTokens ?? [],
      });
      const lf: LFile = LibraryFile.parse({
        id: card.fileId,
        folder: card.folder,
        filename: card.filename,
        format: card.format,
        sizeBytes: Buffer.byteLength(built.content, 'utf8'),
        modifiedAt: card.duplicateOf ? new Date(new Date('2026-10-22T16:41:07Z')).toISOString().replace('.000Z', 'Z') : modifiedAt(card, built.durationSec),
        accountId: card.accountId,
        callType: card.callType,
        messLevel: card.messLevel,
        edgeKind: card.edgeKind,
        featured: card.featured,
        tourPath: card.tourPath,
        recommended: card.recommended,
        callId: card.callId,
      });
      contents.set(card.fileId, built.content);
      golden.set(card.fileId, g);
      library.push(lf);
      if (!card.featured) backfillThemes[card.fileId] = card.insights.map((i) => i.themeId ?? '');
      report.push({
        fileId: card.fileId, callId: card.callId, featured: card.featured, level: card.messLevel, edge: card.edgeKind, format: card.format,
        words: built.content.split(/\s+/).filter(Boolean).length, bytes: lf.sizeBytes, insights: g.insights.length,
        methods: built.methods, minScore: built.scores.length ? Math.min(...built.scores) : null,
      });
    } catch (e) {
      errors.push(`${card.fileId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length) {
    console.error(`BUILD FAILED (${errors.length}):\n${errors.join('\n')}`);
    process.exitCode = 1;
    return;
  }

  for (const lf of library) {
    writeFileSync(join(filesDir, `${lf.id}.${ext(lf.filename)}`), contents.get(lf.id) as string);
    writeFileSync(join(goldenDir, `${lf.id}.json`), JSON.stringify(golden.get(lf.id), null, 2) + '\n');
  }
  library.sort((a, b) => a.folder.localeCompare(b.folder) || b.modifiedAt.localeCompare(a.modifiedAt));
  writeFileSync(join(DATA_DIR, 'library.json'), JSON.stringify(library, null, 2) + '\n');
  writeFileSync(join(DATA_DIR, 'tour-files.json'), JSON.stringify(TOUR_FILES, null, 2) + '\n');
  writeFileSync(
    join(DATA_DIR, 'world', 'themes.json'),
    JSON.stringify(THEME_SEEDS.map((t) => ({ id: t.id, name: t.name, type: t.type, productArea: t.area, summary: t.summary, plannedCount: t.count, weeklyWeights: t.weeks })), null, 2) + '\n',
  );
  writeFileSync(join(DATA_DIR, 'backfill-themes.json'), JSON.stringify(backfillThemes, null, 2) + '\n');
  writeFileSync(join(DATA_DIR, '.cache', 'build-report.json'), JSON.stringify(report, null, 2) + '\n');

  const featured = library.filter((f) => f.featured);
  const methods = report.flatMap((r) => r.methods as string[]);
  const count = (k: string): number => methods.filter((m) => m === k).length;
  console.log(`built ${library.length} files (${featured.length} featured, ${library.length - featured.length} backfill)`);
  console.log(`audit extras folded into golden labels: ${extrasAdded}`);
  console.log(`golden quotes: ${methods.length} (exact ${count('exact')}, relocated ${methods.length - count('exact')})`);
  const byLevel = new Map<string, number>();
  for (const f of featured) byLevel.set(String(f.messLevel ?? f.edgeKind), (byLevel.get(String(f.messLevel ?? f.edgeKind)) ?? 0) + 1);
  console.log(`featured by level/edge: ${[...byLevel.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);
  const totalBytes = library.reduce((s, f) => s + f.sizeBytes, 0);
  console.log(`total size ${(totalBytes / 1024).toFixed(0)} KiB`);
}

if (import.meta.main) run();
