/**
 * Validates the built dataset against the shared Zod contracts and the data rules.
 *   node --env-file=.env scripts/data/check.ts
 * Exits non-zero on any failure.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Account, GoldenLabel, INSIGHT_TYPES, LibraryFile, Person, PRODUCT_AREAS, RoutingRule } from '../../src/shared/contracts.ts';
import { DATA_DIR } from './world.ts';

const problems: string[] = [];
const fail = (msg: string): void => {
  problems.push(msg);
};
const readJson = (p: string): unknown => JSON.parse(readFileSync(join(DATA_DIR, p), 'utf8'));

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T | null {
  const r = schema.safeParse(value);
  if (!r.success) {
    fail(`${label}: ${r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    return null;
  }
  return r.data;
}

export function check(): string[] {
  // ---------------------------------------------------------------- world
  const accounts = parse(z.array(Account), readJson('world/accounts.json'), 'accounts.json') ?? [];
  const people = parse(z.array(Person), readJson('world/people.json'), 'people.json') ?? [];
  const rules = parse(z.array(RoutingRule), readJson('world/routing.json'), 'routing.json') ?? [];
  const taxonomy = readJson('world/taxonomy.json') as { insightTypes: { id: string }[]; productAreas: { id: string }[] };
  const personIds = new Set(people.map((p) => p.id));
  const accountIds = new Set(accounts.map((a) => a.id));
  if (accounts.length !== 14) fail(`expected 14 accounts, got ${accounts.length}`);
  if (people.filter((p) => p.role === 'csm' && p.title.includes('Customer Success Manager')).length !== 6) fail('expected 6 CSMs');
  for (const a of accounts) if (!personIds.has(a.csmId)) fail(`account ${a.id}: unknown CSM ${a.csmId}`);
  const bl = accounts.find((a) => a.id === 'acct_brightline');
  if (!bl || bl.csmId !== 'ppl_marcus' || bl.renewalDate !== '2027-01-15' || bl.health !== 'watch') fail('acct_brightline does not match the brief');
  if (rules.length < 10 || rules.length > 14) fail(`expected 10–14 routing rules, got ${rules.length}`);
  for (const r of rules) if (!personIds.has(r.ownerId)) fail(`rule ${r.id}: unknown owner`);
  const pricing = rules.find((r) => r.id === 'rule_pricing');
  if (!pricing || pricing.channel !== 'slack' || pricing.destination !== '#pricing-feedback') fail('rule_pricing missing or wrong');
  if (!rules.some((r) => r.match.types === null && r.match.areas === null && r.channel === 'triage')) fail('no fallback triage rule');
  if (new Set(rules.map((r) => r.priority)).size !== rules.length) fail('routing priorities are not unique');
  for (const t of INSIGHT_TYPES) if (!taxonomy.insightTypes.some((x) => x.id === t)) fail(`taxonomy missing type ${t}`);
  for (const a of PRODUCT_AREAS) if (!taxonomy.productAreas.some((x) => x.id === a)) fail(`taxonomy missing area ${a}`);

  // ---------------------------------------------------------------- library
  const library = parse(z.array(LibraryFile), readJson('library.json'), 'library.json') ?? [];
  const ids = new Set<string>();
  const callIds = new Set<string>();
  const paths = new Set<string>();
  const contents = new Map<string, string>();
  for (const f of library) {
    if (ids.has(f.id)) fail(`duplicate file id ${f.id}`);
    ids.add(f.id);
    if (callIds.has(f.callId)) fail(`duplicate callId ${f.callId}`);
    callIds.add(f.callId);
    const p = `${f.folder}/${f.filename}`;
    if (paths.has(p)) fail(`duplicate path ${p}`);
    paths.add(p);
    if (f.accountId && !accountIds.has(f.accountId)) fail(`${f.id}: unknown account ${f.accountId}`);
    const ext = f.filename.slice(f.filename.lastIndexOf('.') + 1).toLowerCase();
    const filePath = join(DATA_DIR, 'files', `${f.id}.${ext}`);
    if (!existsSync(filePath)) {
      fail(`${f.id}: missing raw file`);
      continue;
    }
    const buf = readFileSync(filePath);
    if (buf.length !== f.sizeBytes) fail(`${f.id}: sizeBytes ${f.sizeBytes} != actual ${buf.length}`);
    const text = buf.toString('utf8');
    contents.set(f.id, text);
    const expectFormat = { vtt: 'vtt', md: 'md', eml: 'eml', txt: f.format === 'chat' ? 'chat' : 'txt' }[ext];
    if (expectFormat !== f.format) fail(`${f.id}: format ${f.format} does not match extension .${ext}`);
    if (f.format === 'vtt' && !text.startsWith('WEBVTT')) fail(`${f.id}: vtt without WEBVTT header`);
    if (f.format === 'eml' && !/^Return-Path: .*\n[\s\S]*\nMessage-ID: <[^>]+>\n[\s\S]*\nSubject: .+\nFrom: .+\nTo: .+/m.test(text)) fail(`${f.id}: eml headers incomplete`);
    if (/—/.test(text)) fail(`${f.id}: contains an em dash`);
    if (/\b(openai|chatgpt|anthropic|claude|gemini|deepseek|mistral|llama)\b/i.test(text)) fail(`${f.id}: mentions a model vendor`);
    if (/\b(certainly|delve|game-changer|synergy)\b/i.test(text)) fail(`${f.id}: contains an AI-tell phrase`);
    if (f.featured === false && f.tourPath !== null) fail(`${f.id}: backfill file with tourPath`);
    if (!f.featured && (f.modifiedAt < '2026-09-14' || f.modifiedAt > '2026-10-24T12:00:00Z')) fail(`${f.id}: backfill modifiedAt ${f.modifiedAt} outside window`);
  }

  // featured composition
  const featured = library.filter((f) => f.featured);
  if (featured.length !== 48) fail(`expected 48 featured files, got ${featured.length}`);
  for (const lvl of [1, 2, 3, 4, 5] as const) {
    const n = featured.filter((f) => f.messLevel === lvl && !f.edgeKind).length;
    if (n !== 8) fail(`expected 8 featured level-${lvl} files, got ${n}`);
  }
  const edge = (k: string): number => featured.filter((f) => f.edgeKind === k).length;
  for (const [k, n] of [['nothing_actionable', 2], ['injection', 2], ['phi_heavy', 2], ['non_english', 1], ['duplicate', 1]] as const) if (edge(k) !== n) fail(`expected ${n} ${k} files, got ${edge(k)}`);
  for (const f of featured) {
    const want = f.recommended ? 'main'
      : f.edgeKind === 'injection' ? 'security' : f.edgeKind === 'nothing_actionable' ? 'negative' : f.edgeKind === 'phi_heavy' ? 'privacy'
        : f.edgeKind ? null : f.messLevel === 1 ? 'clean' : f.messLevel === 4 || f.messLevel === 5 ? 'messy' : null;
    if (f.tourPath !== want) fail(`${f.id}: tourPath ${f.tourPath}, expected ${want}`);
  }
  const rec = library.filter((f) => f.recommended);
  if (rec.length !== 1) fail(`expected exactly one recommended file, got ${rec.length}`);
  const main = rec[0];
  if (!main || main.id !== 'file_c1042' || main.callId !== 'C-1042' || main.messLevel !== 3 || main.format !== 'vtt' || main.accountId !== 'acct_brightline') fail('recommended file is not C-1042 as specified');
  const dup = featured.find((f) => f.edgeKind === 'duplicate');
  if (dup && contents.get(dup.id) !== contents.get('file_c1042')) fail('duplicate is not a byte copy of C-1042');
  if (dup && dup.filename === main?.filename) fail('duplicate must have a different filename');
  const backfill = library.length - featured.length;
  if (backfill < 200 || backfill > 240) fail(`expected ~220 backfill files, got ${backfill}`);

  const tour = readJson('tour-files.json') as Record<string, string>;
  for (const [path, id] of Object.entries(tour)) {
    const f = library.find((x) => x.id === id);
    if (!f) fail(`tour-files ${path}: unknown file ${id}`);
    else if (f.tourPath !== path) fail(`tour-files ${path}: file ${id} has tourPath ${f.tourPath}`);
  }

  // ---------------------------------------------------------------- golden
  for (const f of library) {
    const p = join(DATA_DIR, 'golden', `${f.id}.json`);
    if (!existsSync(p)) {
      fail(`${f.id}: missing golden label`);
      continue;
    }
    const g = parse(GoldenLabel, JSON.parse(readFileSync(p, 'utf8')), `golden/${f.id}`);
    if (!g) continue;
    if (g.fileId !== f.id) fail(`${f.id}: golden fileId mismatch`);
    const text = contents.get(f.id) ?? '';
    if (g.expectActionable !== g.insights.length > 0) fail(`${f.id}: expectActionable inconsistent with insights`);
    if (f.featured && !f.edgeKind && g.insights.length < 2) fail(`${f.id}: featured file with fewer than 2 insights`);
    for (const [i, ins] of g.insights.entries()) {
      if (ins.quote.length < 4) fail(`${f.id}: insight ${i + 1} quote too short`);
      if (!text.includes(ins.quote)) fail(`${f.id}: insight ${i + 1} quote not in file: "${ins.quote.slice(0, 60)}"`);
      if (ins.owner && !personIds.has(ins.owner)) fail(`${f.id}: insight ${i + 1} unknown owner ${ins.owner}`);
    }
    for (const t of g.phiTokens) if (!text.includes(t)) fail(`${f.id}: PHI token not in file: ${t}`);
    if (f.edgeKind === 'phi_heavy' && g.phiTokens.length < 4) fail(`${f.id}: PHI file needs phiTokens`);
    if (f.edgeKind === 'injection' && (!g.expectInjectionFlag || g.insights.length < 1)) fail(`${f.id}: injection file needs the flag and a genuine insight`);
    if (f.edgeKind === 'nothing_actionable' && g.insights.length) fail(`${f.id}: negative control has insights`);
  }
  return problems;
}

if (import.meta.main) {
  const p = check();
  if (p.length) {
    console.error(`CHECK FAILED (${p.length}):\n- ${p.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log('check: all data valid');
  }
}
