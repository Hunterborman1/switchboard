/**
 * The remote MCP server (/repo/invoca/mcp): bearer-token auth, the JSON-RPC lifecycle, docs as
 * tools and resources, and tools acting as the token's own workspace.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { issueMcpToken } from '../../src/worker/mcp/token.ts';
import { newWs, ORIGIN, SECRETS, seedFixtures, startHarness, type Harness } from './harness.ts';

const MCP = `${ORIGIN}/repo/invoca/mcp`;
let h: Harness;

beforeAll(async () => {
  h = await startHarness();
  await seedFixtures(h.env.DB);
}, 180_000);
afterAll(async () => {
  await h?.close();
});

async function token(ws: string): Promise<string> {
  const r = await h.call('/mcp/token', { method: 'POST', ws, json: {} });
  expect(r.status, r.text).toBe(201);
  expect(r.json.data.url).toBe(MCP);
  return r.json.data.token as string;
}

let seq = 0;
async function rpc(tok: string | null, method: string, params: Record<string, unknown> = {}, opts: { notification?: boolean } = {}) {
  const res = await h.server.fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(opts.notification ? {} : { id: ++seq }) }),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const toolText = (r: { json: any }) => r.json.result.content[0].text as string;

describe('auth', () => {
  it('refuses a missing, forged, expired or revoked token', async () => {
    expect((await rpc(null, 'tools/list')).status).toBe(401);
    expect((await rpc('swb_bogus.sig', 'tools/list')).status).toBe(401);
    const expired = await issueMcpToken({ ws: newWs(), exp: Date.now() - 1000, jti: 'old' }, SECRETS.LINK_SIGNING_SECRET);
    expect((await rpc(expired, 'tools/list')).status).toBe(401);
    const tok = await token(newWs());
    const jti = JSON.parse(Buffer.from(tok.slice(4).split('.')[0]!, 'base64url').toString()).jti;
    await h.env.DB.prepare("INSERT INTO revoked_links (jti, revoked_at, note) VALUES (?, datetime('now'), 'test')").bind(jti).run();
    expect((await rpc(tok, 'tools/list')).status).toBe(401);
  });

  it('GET is not an event stream: 405', async () => {
    const res = await h.server.fetch(MCP, { method: 'GET', headers: { authorization: `Bearer ${await token(newWs())}` } });
    expect(res.status).toBe(405);
  });
});

describe('protocol', () => {
  it('initialize negotiates the version and carries orientation instructions', async () => {
    const tok = await token(newWs());
    const r = await rpc(tok, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(r.json.result.protocolVersion).toBe('2025-06-18');
    expect(r.json.result.serverInfo.name).toBe('switchboard');
    expect(r.json.result.instructions).toContain('48 hours');
    expect(r.json.result.instructions).toContain('Simulated');
    const unknown = await rpc(tok, 'initialize', { protocolVersion: '1999-01-01' });
    expect(unknown.json.result.protocolVersion).toBe('2025-11-25');
    expect((await rpc(tok, 'notifications/initialized', {}, { notification: true })).status).toBe(202);
    expect((await rpc(tok, 'no/such')).json.error.code).toBe(-32601);
  });

  it('lists tools, docs as resources, and prompts', async () => {
    const tok = await token(newWs());
    const tools = (await rpc(tok, 'tools/list')).json.result.tools.map((t: { name: string }) => t.name);
    expect(tools).toEqual(expect.arrayContaining(['about', 'read_doc', 'process_conversation', 'get_conversation', 'review_insight', 'agent_ops_trace']));
    const resources = (await rpc(tok, 'resources/list')).json.result.resources;
    expect(resources.map((x: { uri: string }) => x.uri)).toContain('switchboard://docs/walkthrough');
    const doc = await rpc(tok, 'resources/read', { uri: 'switchboard://docs/walkthrough' });
    expect(doc.json.result.contents[0].text).toMatch(/^---\r?\ntitle:/);
    expect((await rpc(tok, 'prompts/list')).json.result.prompts.length).toBeGreaterThan(0);
  });
});

describe('tools', () => {
  it('about and read_doc answer from the bundled docs', async () => {
    const tok = await token(newWs());
    expect(toolText(await rpc(tok, 'tools/call', { name: 'about', arguments: {} }))).toContain('Signal Loop');
    expect(toolText(await rpc(tok, 'tools/call', { name: 'read_doc', arguments: { name: 'architecture' } }))).toContain('Workflow');
    const missing = await rpc(tok, 'tools/call', { name: 'read_doc', arguments: { name: 'nope' } });
    expect(missing.json.result.isError).toBe(true);
  });

  it('process_conversation runs the real pipeline in the token’s workspace, visible to that workspace only', async () => {
    const ws = newWs();
    const tok = await token(ws);
    const text = `Notes from the Brightline check-in (${crypto.randomUUID().slice(0, 8)}).\nCustomer: honestly the offline conversions thing is killing us, they land in Google Ads days late.\nCSM: logged.`;
    const r = await rpc(tok, 'tools/call', { name: 'process_conversation', arguments: { text, filename: 'brightline-notes.txt' } });
    expect(r.json.result.isError, toolText(r)).toBe(false);
    const out = JSON.parse(toolText(r));
    expect(['completed', 'awaiting_review']).toContain(out.run.status);
    expect(out.steps).toHaveLength(10);
    expect(out.insights.length).toBeGreaterThan(0);
    expect(out.insights[0].quotes[0].text.length).toBeGreaterThan(0);

    const mine = await h.call(`/runs/${out.run.id}`, { ws });
    expect(mine.status).toBe(200);
    expect((await h.call(`/runs/${out.run.id}`, { ws: newWs() })).status).toBe(404);
    const listed = JSON.parse(toolText(await rpc(tok, 'tools/call', { name: 'list_conversations', arguments: { limit: 5 } })));
    expect(listed[0].id).toBe(out.run.id);
  });

  it('a bad argument comes back as a tool error, not a protocol error', async () => {
    const tok = await token(newWs());
    const r = await rpc(tok, 'tools/call', { name: 'get_conversation', arguments: { runId: 'run_doesnotexist' } });
    expect(r.status).toBe(200);
    expect(r.json.result.isError).toBe(true);
  });
});
