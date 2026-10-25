/**
 * Worker integration harness: the real Worker (default export, Hono API, Workflow, local D1)
 * via wrangler's createTestHarness, with OpenRouter replaced by a local HTTP mock that speaks
 * the chat-completions protocol (so src/worker/ai.ts and the AI SDK run for real).
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createTestHarness } from 'wrangler';
import { passwordToken } from '../../src/worker/gate.ts';
import { runPipeline } from '../../src/pipeline/run.ts';
import { toRecording } from '../../src/pipeline/replay.ts';
import { hashEmbed } from '../../src/pipeline/theme.ts';
import { sha256Hex } from '../../src/pipeline/util.ts';
import type { LibraryFile } from '../../src/shared/contracts.ts';
import { memStore } from '../../scripts/lib/memstore.ts';
import { mockRespond } from '../helpers/mockModel.ts';
import { mockLlm } from '../helpers/mockLlm.ts';
import { fixtureFile, world } from '../helpers/fixtures.ts';

export const ORIGIN = 'https://repos.hunterborman.com';
export const API = `${ORIGIN}/repo/invoca/api`;
export const SECRETS = { INVOCA_PASSWORD: 'test-password', LINK_SIGNING_SECRET: 'test-link-secret', SITE_PASSWORD: 'test-site-password', OPENROUTER_API_KEY: 'test-openrouter-key' };

export type MockRequest = { model: string; schema: string; user: string; body: Record<string, unknown>; status: number };

export function startMockOpenRouter(): Promise<{ url: string; requests: MockRequest[]; close(): Promise<void>; server: Server }> {
  const requests: MockRequest[] = [];
  const badJsonSeen = new Set<string>();
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', async () => {
      const body = JSON.parse(raw || '{}') as Record<string, unknown>;
      const messages = (body.messages as { role: string; content: unknown }[]) ?? [];
      const firstUser = messages.find((m) => m.role === 'user');
      const user = typeof firstUser?.content === 'string' ? firstUser.content : JSON.stringify(firstUser?.content ?? '');
      const schema = String(((body.response_format as { json_schema?: { name?: string } }) ?? {}).json_schema?.name ?? '');
      const model = String(body.model);
      let status = 200;
      const send = (code: number, payload: unknown) => {
        status = code;
        requests.push({ model, schema, user, body, status });
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (user.includes('FORCE_LLM_ERROR')) return send(500, { error: { message: 'mock upstream failure', code: 500 } });
      if (user.includes('PRIMARY_DOWN') && model.startsWith('deepseek/')) return send(503, { error: { message: 'mock primary unavailable', code: 503 } });
      if (user.includes('SLOW_MODEL')) await new Promise((r) => setTimeout(r, 4000));
      let content: string;
      const key = `${schema}:${user.length}`;
      if (user.includes('FORCE_BAD_JSON') && schema === 'insights' && !badJsonSeen.has(key) && messages.length === 1) {
        badJsonSeen.add(key);
        content = JSON.stringify({ insights: [{ type: 'not_a_type', summary: 'x' }] });
      } else {
        content = JSON.stringify(mockRespond(schema, user));
      }
      send(200, {
        id: `gen-${requests.length}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: Math.ceil(raw.length / 4), completion_tokens: Math.ceil(content.length / 4), total_tokens: Math.ceil((raw.length + content.length) / 4), cost: 0.0004 },
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ url: `http://127.0.0.1:${port}/api/v1`, requests, server, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;

export async function startHarness(opts: { vars?: Record<string, string> } = {}) {
  const mock = await startMockOpenRouter();
  const server = createTestHarness({
    workers: [{ configPath: './wrangler.jsonc', vars: { OPENROUTER_BASE_URL: mock.url, EMBED_MODE: 'hash', VECTOR_MODE: 'd1', ...(opts.vars ?? {}) }, secrets: SECRETS }],
  });
  await server.listen();
  const worker = server.getWorker();
  await worker.applyD1Migrations('DB');
  const env = (await worker.getEnv()) as { DB: D1Database; KV: KVNamespace };
  const pw = await passwordToken(SECRETS.INVOCA_PASSWORD);
  const ownerToken = await ownerCookie(SECRETS.SITE_PASSWORD);

  const call = async (path: string, init: RequestInit & { ws?: string | null; auth?: 'password' | 'owner' | 'none'; json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    const cookies: string[] = [];
    const auth = init.auth ?? 'password';
    if (auth === 'password') cookies.push(`hb_invoca=${pw}`);
    if (auth === 'owner') cookies.push(`hb_auth=${ownerToken}`);
    if (init.ws) cookies.push(`sl_ws=${init.ws}`);
    if (cookies.length) headers.set('cookie', cookies.join('; '));
    let body = init.body;
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(init.json);
    }
    const res = await server.fetch(path.startsWith('http') ? path : `${API}${path}`, { ...init, headers, body, redirect: 'manual' });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, headers: res.headers, json, text };
  };

  return { server, worker, env, mock, call, pw, ownerToken, close: async () => (await server.close(), await mock.close()) };
}

async function ownerCookie(sitePassword: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(`hb-gate|${sitePassword}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('hb-site-auth-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newWs(): string {
  return `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export const LIB: (LibraryFile & { file: string; content?: string })[] = [
  { id: 'file_c1042', folder: 'Calls/Week 43', filename: '2026-10-21_Brightline_QBR_transcript.vtt', format: 'vtt', sizeBytes: 0, modifiedAt: '2026-10-21T17:00:00Z', accountId: 'acct_brightline', callType: 'QBR', messLevel: 3, edgeKind: null, featured: true, tourPath: 'main', recommended: true, callId: 'C-1042', file: 'brightline-qbr.vtt' },
  { id: 'file_meridian_phi', folder: 'Calls/Week 43', filename: 'meridian-phi.txt', format: 'txt', sizeBytes: 0, modifiedAt: '2026-10-21T18:00:00Z', accountId: 'acct_meridian', callType: 'check-in', messLevel: null, edgeKind: 'phi_heavy', featured: true, tourPath: 'privacy', recommended: false, callId: 'C-1043', file: 'meridian-phi.txt' },
  { id: 'file_injection', folder: 'Calls/Week 43', filename: 'fwd_ RE_ dashboard export.eml', format: 'eml', sizeBytes: 0, modifiedAt: '2026-10-21T19:00:00Z', accountId: 'acct_sunpeak', callType: 'email', messLevel: null, edgeKind: 'injection', featured: true, tourPath: 'security', recommended: false, callId: 'C-1044', file: 'injection.eml' },
  { id: 'file_friendly', folder: 'Notes/October', filename: 'sunpeak-checkin.md', format: 'md', sizeBytes: 0, modifiedAt: '2026-10-21T20:00:00Z', accountId: 'acct_sunpeak', callType: 'check-in', messLevel: 1, edgeKind: 'nothing_actionable', featured: true, tourPath: 'negative', recommended: false, callId: 'C-1045', file: 'friendly.md' },
  { id: 'file_broken', folder: 'Calls/Week 43', filename: 'broken.txt', format: 'txt', sizeBytes: 0, modifiedAt: '2026-10-21T21:00:00Z', accountId: 'acct_brightline', callType: 'check-in', messLevel: 2, edgeKind: null, featured: true, tourPath: null, recommended: false, callId: 'C-1046', file: '', content: 'Customer: the offline conversions thing is killing us FORCE_LLM_ERROR\nCSM: noted' },
  { id: 'file_slow', folder: 'Calls/Week 43', filename: 'slow.txt', format: 'txt', sizeBytes: 0, modifiedAt: '2026-10-21T23:00:00Z', accountId: 'acct_brightline', callType: 'check-in', messLevel: 2, edgeKind: null, featured: true, tourPath: null, recommended: false, callId: 'C-1048', file: '', content: 'Customer: the offline conversions thing is killing us SLOW_MODEL\nCSM: noted' },
  { id: 'file_fallback', folder: 'Calls/Week 43', filename: 'primary-down.txt', format: 'txt', sizeBytes: 0, modifiedAt: '2026-10-21T22:00:00Z', accountId: 'acct_brightline', callType: 'check-in', messLevel: 2, edgeKind: null, featured: true, tourPath: null, recommended: false, callId: 'C-1047', file: '', content: 'Customer: signal AI is tagging our after hours calls as spam PRIMARY_DOWN\nCSM: noted' },
];

/** Seed world, library, raw files and replay recordings (made with the mock model) into local D1. */
export async function seedFixtures(db: D1Database): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const a of world.accounts) stmts.push(db.prepare('INSERT OR REPLACE INTO accounts (id, data) VALUES (?, ?)').bind(a.id, JSON.stringify(a)));
  for (const p of world.people) stmts.push(db.prepare('INSERT OR REPLACE INTO people (id, data) VALUES (?, ?)').bind(p.id, JSON.stringify(p)));
  for (const r of world.rules) stmts.push(db.prepare("INSERT OR REPLACE INTO routing_rules (workspace_id, id, priority, data, updated_at) VALUES ('seed', ?, ?, ?, ?)").bind(r.id, r.priority, JSON.stringify(r), new Date().toISOString()));
  for (const f of LIB) {
    const content = f.content ?? fixtureFile(f.file);
    const sha = await sha256Hex(content);
    const { file: _f, content: _c, ...lf } = f;
    stmts.push(db.prepare('INSERT OR IGNORE INTO raw_files (sha256, filename, size_bytes, content, created_at) VALUES (?,?,?,?,?)').bind(sha, f.filename, content.length, content, f.modifiedAt));
    stmts.push(db.prepare('INSERT OR REPLACE INTO library_files (id, sha256, featured, sort_key, data) VALUES (?,?,?,?,?)').bind(f.id, sha, 1, `${f.folder}/${f.filename}`, JSON.stringify({ ...lf, sizeBytes: content.length })));
    // Recording: the C-1042 pipeline output stands in for every file (content-specific only for c1042).
    const recContent = f.content ? fixtureFile('brightline-qbr.vtt') : content;
    let t = Date.parse('2026-10-21T17:00:00Z');
    const r = await runPipeline(
      { runId: 'run_rec', workspaceId: 'rec', fileId: f.id, filename: f.filename, content: recContent, promptVersion: 'v4', account: world.accounts.find((a) => a.id === f.accountId) ?? null, people: world.people, accounts: world.accounts, rules: world.rules },
      { llm: mockLlm(), embed: async (x) => ({ vectors: x.map((y) => hashEmbed(y)), model: 'hash' }), vectorQuery: async () => [], store: memStore(), clock: { now: () => (t += 150) } },
    );
    const rec = JSON.stringify(toRecording(f.id, r, new Date(Date.parse('2026-10-21T17:00:00Z') + 150).toISOString(), 'v4'));
    stmts.push(db.prepare('DELETE FROM replays WHERE file_id = ?').bind(f.id));
    for (let i = 0, part = 0; i < rec.length; i += 50_000, part++) stmts.push(db.prepare('INSERT INTO replays (file_id, part, recorded_at, data) VALUES (?,?,?,?)').bind(f.id, part, '2026-10-21T17:00:00Z', rec.slice(i, i + 50_000)));
  }
  stmts.push(db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('live_enabled', 'true', ?)").bind(new Date().toISOString()));
  await db.batch(stmts);
}

export async function waitForRun(h: Harness, runId: string, ws: string, until: (d: any) => boolean = (d) => !['queued', 'running'].includes(d.run.status), timeoutMs = 45_000): Promise<any> {
  const t0 = Date.now();
  let last: any = null;
  while (Date.now() - t0 < timeoutMs) {
    const r = await h.call(`/runs/${runId}`, { ws });
    last = r.json?.data;
    if (r.status === 200 && last && until(last)) return last;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`run ${runId} did not settle: ${JSON.stringify(last?.run ?? last)?.slice(0, 400)}`);
}
