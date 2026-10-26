/** Envelope, error shape and body validation shared by the gated API's route modules. */
import type { Context } from 'hono';
import type { z } from 'zod';
import type { Envelope } from '../../shared/contracts.ts';
import { nowIso } from '../db.ts';
import type { ApiEnv } from '../env.ts';
import type { TraceCtx } from '../telemetry.ts';

export type Vars = { ws: string; trace: TraceCtx };
export type AppEnv = { Bindings: ApiEnv; Variables: Vars };
export type C = Context<AppEnv>;

export function ok<T>(c: C, data: T, status: 200 | 201 = 200): Response {
  const body: Envelope<T> = { data, dataAsOf: nowIso() };
  return c.json(body, status);
}

export function fail(c: C, status: 400 | 403 | 404 | 409 | 429 | 500 | 503, code: string, message: string): Response {
  return c.json({ error: { code, message } }, status);
}

export function issues(err: z.ZodError): string {
  return err.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

export async function body<T>(c: C, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, res: fail(c, 400, 'invalid_request', 'Body must be JSON') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: fail(c, 400, 'invalid_request', issues(parsed.error)) };
  return { ok: true, data: parsed.data };
}

/** The viewer as Agent Ops counts them (owner, or a short workspace id). */
export const viewerOf = (c: C) => (c.env.ACCESS.via === 'owner' ? 'owner' : `viewer:${c.get('ws').replace(/^ws_/, '').slice(0, 6)}`);
