/**
 * Docs for AI assistants, all fed by the registry in src/worker/mcp/docs.ts: every write-up and
 * Q&A page as Markdown at its URL plus ".md" (rendered from the pages' data), every other doc at
 * its repo path, the docs .zip with its folders and INDEX.md, llms.txt, and MCP read_doc. All of
 * it sits behind the same gate as the SPA and carries the standard security headers.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSP } from '../../src/worker/http.ts';
import { CHAPTER_PAGES } from '../../src/shared/writeup/chapters.ts';
import { QUESTION_PAGES } from '../../src/shared/writeup/questions.ts';
import { chapterMarkdown, questionMarkdown, questionsIndexMarkdown, writeupIndexMarkdown } from '../../src/shared/writeup/markdown.ts';
import { newWs, ORIGIN, startHarness, type Harness } from './harness.ts';

const BASE = `${ORIGIN}/repo/invoca`;
const SITE = 'https://repos.hunterborman.com/repo/invoca';
const repoFile = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const REPORTS = readdirSync(new URL('../../docs/reports/', import.meta.url))
  .filter((f) => f.endsWith('.md'))
  .map((f) => `docs/reports/${f}`);
const REPO_DOCS = ['README.md', 'docs/WALKTHROUGH.md', 'docs/ARCHITECTURE.md', 'docs/DESIGN.md', 'docs/RUNBOOK.md', 'docs/MCP.md', 'docs/speaker-notes.md', ...REPORTS];

/** Every page's Markdown: its URL (after /repo/invoca/), its file in the .zip (if any) and its text. */
const PAGES = [
  { url: 'write-up.md', zip: null, text: writeupIndexMarkdown() },
  { url: 'backup.md', zip: null, text: questionsIndexMarkdown() },
  ...CHAPTER_PAGES.map((c) => ({ url: `write-up/${c.id}.md`, zip: `write-up/${String(c.number).padStart(2, '0')}-${c.id}.md`, text: chapterMarkdown(c) })),
  ...QUESTION_PAGES.map((q) => ({ url: `backup/${q.id}.md`, zip: `questions/${q.id}.md`, text: questionMarkdown(q) })),
];
const ZIP_ENTRIES = ['INDEX.md', ...PAGES.flatMap((p) => (p.zip ? [p.zip] : [])), ...REPO_DOCS];

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
}, 180_000);
afterAll(async () => {
  await h?.close();
});

const get = (path: string, auth: 'password' | 'owner' | 'none' = 'password', method = 'GET') =>
  h.server.fetch(`${BASE}/${path}`, {
    method,
    redirect: 'manual',
    headers: auth === 'password' ? { cookie: `hb_invoca=${h.pw}` } : auth === 'owner' ? { cookie: `hb_invoca_owner=${h.ownerToken}` } : {},
  });

function expectSecure(r: Response) {
  expect(r.headers.get('content-security-policy')).toBe(CSP);
  expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  expect(r.headers.get('x-frame-options')).toBe('DENY');
  expect(r.headers.get('cache-control')).toBe('no-store');
}

describe('gated', () => {
  for (const path of [...PAGES.map((p) => p.url), 'llms.txt', 'switchboard-docs.zip', 'README.md', 'docs/ARCHITECTURE.md', 'docs/reports/robustness.md']) {
    it(`${path} without a cookie redirects to sign-in and leaks nothing`, async () => {
      const r = await get(path, 'none');
      expect(r.status).toBe(302);
      expect(r.headers.get('location')).toContain('/repo/invoca/login?next=');
      const body = await r.text();
      expect(body).not.toContain('Every call is a signal');
      expect(body).not.toContain('Switchboard');
    });
  }

  it('a forged password cookie gets nothing either', async () => {
    const r = await h.server.fetch(`${BASE}/switchboard-docs.zip`, { redirect: 'manual', headers: { cookie: `hb_invoca=${'0'.repeat(64)}` } });
    expect(r.status).toBe(302);
  });
});

describe('each write-up and Q&A page as Markdown', () => {
  for (const p of PAGES) {
    it(`${p.url} is the page's Markdown, rendered from its data`, async () => {
      const r = await get(p.url);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
      expectSecure(r);
      expect(await r.text()).toBe(p.text);
    });
  }

  it('the index links every chapter and question page and its Markdown', async () => {
    const body = await (await get('write-up.md')).text();
    for (const c of CHAPTER_PAGES) expect(body).toContain(`(${SITE}/write-up/${c.id}.md)`);
    for (const q of QUESTION_PAGES) expect(body).toContain(`(${SITE}/backup/${q.id}.md)`);
  });

  it('the owner cookie gets them too, and HEAD has no body', async () => {
    expect((await get('write-up/call.md', 'owner')).status).toBe(200);
    const head = await get('backup/cost.md', 'password', 'HEAD');
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('an unknown chapter or question is not served as Markdown', async () => {
    for (const path of ['write-up/nope.md', 'backup/nope.md', 'questions/cost.md']) {
      const r = await get(path);
      expect(r.headers.get('content-type') ?? '', path).not.toContain('text/markdown');
    }
  });
});

describe('each repo doc at its own URL', () => {
  for (const file of REPO_DOCS) {
    it(`${file} is served as text/markdown, byte for byte`, async () => {
      const r = await get(file);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
      expect(await r.text()).toBe(repoFile(file));
    });
  }

  it('the walkthrough is also at walkthrough.md', async () => {
    expect(await (await get('walkthrough.md')).text()).toBe(repoFile('docs/WALKTHROUGH.md'));
  });

  it('a path that is not in the registry is not served as a doc', async () => {
    const r = await get('docs/PLAN.md');
    expect(r.headers.get('content-type') ?? '').not.toContain('text/markdown');
  });
});

describe('switchboard-docs.zip', () => {
  it('is an attachment with one file per chapter and per question in folders, every repo doc and INDEX.md', async () => {
    const r = await get('switchboard-docs.zip');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/zip');
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="switchboard-docs.zip"');
    expectSecure(r);
    const files = unzipSync(new Uint8Array(await r.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([...ZIP_ENTRIES].sort());
    expect(Object.keys(files)).toContain('write-up/01-signal.md');
    expect(Object.keys(files)).toContain('questions/cost.md');
    for (const file of REPO_DOCS) expect(strFromU8(files[file]!), file).toBe(repoFile(file));
    for (const p of PAGES) if (p.zip) expect(strFromU8(files[p.zip]!), p.zip).toBe(p.text);
  });

  it('INDEX.md lists every file, where it lives on the site, and how to connect over MCP', async () => {
    const files = unzipSync(new Uint8Array(await (await get('switchboard-docs.zip')).arrayBuffer()));
    const index = strFromU8(files['INDEX.md']!);
    for (const file of ZIP_ENTRIES.filter((f) => f !== 'INDEX.md')) expect(index, file).toContain(`\`${file}\``);
    for (const p of PAGES) expect(index, p.url).toContain(`${SITE}/${p.url}`);
    expect(index).toContain(`claude mcp add --transport http switchboard ${SITE}/mcp`);
    expect(index).toContain(`${SITE}/app/claude`);
    expect(index).toContain('read_doc');
  });
});

describe('llms.txt', () => {
  it('says what this is in one line, then links every Markdown URL, the zip and MCP', async () => {
    const r = await get('llms.txt');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expectSecure(r);
    const body = await r.text();
    const lines = body.split('\n').filter((l) => l.trim());
    expect(lines[0]).toBe('# Switchboard');
    expect(lines[1]).toMatch(/^> Switchboard reads any customer conversation/);
    for (const url of [...PAGES.map((p) => p.url), 'walkthrough.md', ...REPO_DOCS.filter((f) => f !== 'docs/WALKTHROUGH.md'), 'switchboard-docs.zip', 'mcp']) expect(body, url).toContain(`](${SITE}/${url})`);
  });
});

describe('MCP read_doc', () => {
  it('reads the write-up, a chapter and a question from the same registry', async () => {
    const tok = await h.call('/mcp/token', { method: 'POST', ws: newWs(), json: {} });
    expect(tok.status, tok.text).toBe(201);
    const read = async (name: string) => {
      const res = await h.server.fetch(`${BASE}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${tok.json.data.token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'read_doc', arguments: { name } } }),
      });
      return ((await res.json()) as { result: { content: { text: string }[] } }).result.content[0]!.text;
    };
    expect(await read('writeup')).toBe(writeupIndexMarkdown());
    expect(await read('writeup_call')).toBe(chapterMarkdown(CHAPTER_PAGES.find((c) => c.id === 'call')!));
    expect(await read('question_build_vs_buy')).toBe(questionMarkdown(QUESTION_PAGES.find((q) => q.id === 'build-vs-buy')!));
    expect(await read('questions')).toBe(questionsIndexMarkdown());
  });
});
