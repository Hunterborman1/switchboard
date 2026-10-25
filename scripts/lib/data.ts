/**
 * Load the synthetic world and file library from data/** (produced by the data pipeline),
 * falling back to tests/fixtures/** so every script can run before data/READY exists.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Account, GoldenLabel, LibraryFile, Person, RoutingRule } from '../../src/shared/contracts.ts';
import { coerceTaxonomy } from '../../src/shared/prompts/taxonomy.ts';
import type { Taxonomy } from '../../src/pipeline/types.ts';
import { z } from 'zod';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA = join(ROOT, 'data');
export const dataReady = () => existsSync(join(DATA, 'READY'));

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as T;
}

export type World = { accounts: Account[]; people: Person[]; rules: RoutingRule[]; taxonomy: Taxonomy; taxonomyRaw: unknown; source: 'data' | 'fixtures' };

export function loadWorld(): World {
  const w = join(DATA, 'world');
  if (existsSync(join(w, 'accounts.json')) && existsSync(join(w, 'people.json')) && existsSync(join(w, 'routing.json'))) {
    const rulesRaw = readJson<unknown>(join(w, 'routing.json'));
    const rules = z.array(RoutingRule).parse(Array.isArray(rulesRaw) ? rulesRaw : (rulesRaw as { rules: unknown }).rules);
    const taxonomyRaw = existsSync(join(w, 'taxonomy.json')) ? readJson<unknown>(join(w, 'taxonomy.json')) : null;
    return {
      accounts: z.array(Account).parse(readJson(join(w, 'accounts.json'))),
      people: z.array(Person).parse(readJson(join(w, 'people.json'))),
      rules,
      taxonomy: coerceTaxonomy(taxonomyRaw),
      taxonomyRaw,
      source: 'data',
    };
  }
  const f = readJson<{ accounts: Account[]; people: Person[]; rules: RoutingRule[] }>(join(ROOT, 'tests/fixtures/world.json'));
  return { ...f, taxonomy: coerceTaxonomy(null), taxonomyRaw: null, source: 'fixtures' };
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

export type LibraryEntry = LibraryFile & { path: string; content: string };

/** All library files (featured + backfill) with their content. */
export function loadLibrary(): LibraryEntry[] {
  const libPath = join(DATA, 'library.json');
  if (!existsSync(libPath)) return fixtureLibrary();
  const raw = readJson<unknown>(libPath);
  const list = (Array.isArray(raw) ? raw : (raw as { files: unknown[] }).files) as Record<string, unknown>[];
  const files = walk(join(DATA, 'files'));
  const byBase = new Map<string, string[]>();
  for (const f of files) byBase.set(basename(f), [...(byBase.get(basename(f)) ?? []), f]);
  const out: LibraryEntry[] = [];
  for (const item of list) {
    const lf = LibraryFile.parse(item);
    const explicit = typeof item.path === 'string' ? join(DATA, item.path as string) : null;
    const candidates = [explicit, ...(byBase.get(lf.filename) ?? []), ...files.filter((f) => basename(f).startsWith(`${lf.id}.`) || basename(f) === lf.id)].filter((x): x is string => !!x && existsSync(x));
    // Prefer a path under the file's folder when several share a basename.
    const pick = candidates.find((c) => c.replace(/\\/g, '/').includes(lf.folder)) ?? candidates[0];
    if (!pick) throw new Error(`library file ${lf.id} (${lf.filename}) has no content under data/files`);
    out.push({ ...lf, path: pick, content: readFileSync(pick, 'utf8') });
  }
  return out;
}

function fixtureLibrary(): LibraryEntry[] {
  const dir = join(ROOT, 'tests/fixtures/files');
  const spec: [string, string, LibraryFile['format'], string | null, LibraryFile['messLevel'], LibraryFile['edgeKind'], LibraryFile['tourPath'], boolean][] = [
    ['file_c1042', 'brightline-qbr.vtt', 'vtt', 'acct_brightline', 3, null, 'main', true],
    ['file_meridian_phi', 'meridian-phi.txt', 'txt', 'acct_meridian', null, 'phi_heavy', 'privacy', false],
    ['file_sunpeak_injection', 'injection.eml', 'eml', 'acct_sunpeak', null, 'injection', 'security', false],
    ['file_sunpeak_friendly', 'friendly.md', 'md', 'acct_sunpeak', null, 'nothing_actionable', 'negative', false],
    ['file_brightline_slack', 'slack.chat', 'chat', 'acct_brightline', 5, null, 'messy', false],
  ];
  return spec.map(([id, filename, format, accountId, messLevel, edgeKind, tourPath, recommended], i) => {
    const path = join(dir, filename);
    const content = readFileSync(path, 'utf8');
    return {
      id, folder: 'Calls/Week 43', filename, format, sizeBytes: Buffer.byteLength(content), modifiedAt: `2026-10-2${i}T16:00:00.000Z`, accountId, callType: 'check-in', messLevel, edgeKind,
      featured: true, tourPath, recommended, callId: `C-${1042 + i}`, path, content,
    };
  });
}

export function loadGolden(): Map<string, GoldenLabel> {
  const dir = join(DATA, 'golden');
  const out = new Map<string, GoldenLabel>();
  if (existsSync(dir)) {
    for (const f of walk(dir).filter((x) => x.endsWith('.json'))) {
      const raw = readJson<unknown>(f);
      for (const g of Array.isArray(raw) ? raw : [raw]) {
        const parsed = GoldenLabel.parse(g);
        out.set(parsed.fileId, parsed);
      }
    }
    return out;
  }
  const fx = join(ROOT, 'tests/fixtures/golden.json');
  if (existsSync(fx)) for (const g of readJson<unknown[]>(fx)) out.set(GoldenLabel.parse(g).fileId, GoldenLabel.parse(g));
  return out;
}
