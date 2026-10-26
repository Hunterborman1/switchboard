/**
 * Remote MCP server at /repo/invoca/mcp (Streamable HTTP, stateless: every POST carries one
 * JSON-RPC message or a batch and gets a JSON reply). Auth is a bearer token from
 * POST /api/mcp/token (token.ts); tools call the product API as that token's workspace.
 */
import { api } from '../api/index.ts';
import type { Env } from '../env.ts';
import { signWorkspace, WS_COOKIE } from '../gate.ts';
import { clientIp, secure } from '../http.ts';
import { DOCS, docByName } from './docs.ts';
import { bearer, verifyMcpToken } from './token.ts';
import { ABOUT, toolByName, TOOLS, ToolError, type Call } from './tools.ts';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'switchboard', title: 'Switchboard (Signal Loop)', version: '1.0.0' };

type RpcRequest = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
type RpcResponse = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const PROMPTS = [
  { name: 'tour', title: 'Walk me through it', description: 'A guided explanation of what was built, what is real and why.', text: 'Read the walkthrough doc and the about tool, then walk me through Switchboard and Signal Loop: the problem, what was built in 48 hours, what is real versus simulated and why, and how the AI pipeline works. Use real numbers from the tools.' },
  { name: 'analyze_call', title: 'Analyse a call', description: 'Process a conversation and explain every step of the result.', text: 'Process this conversation with process_conversation, then explain each step: what triage decided, what was extracted, which quotes were checked, how each insight was scored and gated (including the second opinion), and where it was routed. Conversation:\n\n' },
];

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'access-control-allow-methods': 'POST, OPTIONS' };

function reply(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return secure(new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS, ...headers } }));
}

const rpcError = (id: RpcResponse['id'], code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

/** The product API, called in-process as the token's workspace. */
function internalCall(env: Env, ctx: ExecutionContext, origin: string, cookie: string, ip: string, linkExpiresAt: string): Call {
  return async <T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> => {
    const req = new Request(`${origin}/repo/invoca/api${path}`, {
      method,
      headers: { cookie, 'x-signal-loop': '1', 'cf-connecting-ip': ip, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await api.fetch(req, { ...env, ACCESS: { ok: true, via: 'mcp', linkExpiresAt } }, ctx);
    const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (!res.ok) throw new ToolError(json?.error?.message ?? `The API answered ${res.status}`);
    return json?.data as T;
  };
}

async function handle(msg: RpcRequest, call: Call): Promise<RpcResponse | null> {
  const id = msg.id ?? null;
  const p = msg.params ?? {};
  if (msg.id === undefined) return null; // a notification: nothing to answer
  switch (msg.method) {
    case 'initialize': {
      const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : '';
      return {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: ABOUT,
        },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ run: _run, ...t }) => t) } };
    case 'tools/call': {
      const tool = toolByName(String(p.name ?? ''));
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(p.name)}`);
      try {
        const out = await tool.run((p.arguments as Record<string, unknown>) ?? {}, call);
        const text = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: false } };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: message }], isError: true } };
      }
    }
    case 'resources/list':
      return { jsonrpc: '2.0', id, result: { resources: DOCS.map((d) => ({ uri: `switchboard://docs/${d.name}`, name: d.name, title: d.title, description: d.description, mimeType: 'text/markdown' })) } };
    case 'resources/read': {
      const uri = String(p.uri ?? '');
      const doc = docByName(uri.replace('switchboard://docs/', ''));
      if (!doc) return rpcError(id, -32002, `Resource not found: ${uri}`);
      return { jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'text/markdown', text: doc.text }] } };
    }
    case 'prompts/list':
      return { jsonrpc: '2.0', id, result: { prompts: PROMPTS.map(({ text: _t, ...x }) => x) } };
    case 'prompts/get': {
      const prompt = PROMPTS.find((x) => x.name === p.name);
      if (!prompt) return rpcError(id, -32602, `Unknown prompt: ${String(p.name)}`);
      return { jsonrpc: '2.0', id, result: { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text: prompt.text } }] } };
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function handleMcp(req: Request, env: Env, ctx: ExecutionContext, isRevoked: (jti: string) => Promise<boolean>): Promise<Response> {
  if (req.method === 'OPTIONS') return reply(null, 204);
  if (req.method !== 'POST') return reply(rpcError(null, -32000, 'Use POST (this server does not open an event stream)'), 405, { allow: 'POST, OPTIONS' });

  const token = bearer(req);
  const claims = token ? await verifyMcpToken(token, env.LINK_SIGNING_SECRET, Date.now()) : null;
  let revoked = true;
  try {
    revoked = claims ? await isRevoked(claims.jti) : true;
  } catch {
    revoked = true; // fail closed when the revocation list can't be read
  }
  if (!claims || revoked) {
    return reply(rpcError(null, -32001, 'Missing, expired or revoked token. Create one in Switchboard: Workspace, Connect Claude.'), 401, { 'www-authenticate': 'Bearer realm="switchboard"' });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(rpcError(null, -32700, 'Parse error: the body must be JSON-RPC 2.0'), 400);
  }
  const cookie = `${WS_COOKIE}=${await signWorkspace(claims.ws, env.LINK_SIGNING_SECRET)}`;
  const call = internalCall(env, ctx, new URL(req.url).origin, cookie, clientIp(req), new Date(claims.exp).toISOString());

  const messages = Array.isArray(body) ? body : [body];
  const valid = messages.every((m) => !!m && typeof m === 'object' && (m as RpcRequest).jsonrpc === '2.0' && typeof (m as RpcRequest).method === 'string');
  if (!valid) return reply(rpcError(null, -32600, 'Invalid request'), 400);
  const out = (await Promise.all((messages as RpcRequest[]).map((m) => handle(m, call)))).filter((r): r is RpcResponse => !!r);
  if (!out.length) return reply(null, 202);
  return reply(Array.isArray(body) ? out : out[0]);
}
