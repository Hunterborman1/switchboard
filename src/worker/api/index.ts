import { Hono } from 'hono';
import type { ApiEnv } from '../env';

/** The gated JSON API, mounted under /repo/invoca/api. */
export const api = new Hono<{ Bindings: ApiEnv }>().basePath('/repo/invoca/api');

api.get('/ping', (c) => c.json({ data: { ok: true, via: c.env.ACCESS.via }, dataAsOf: new Date().toISOString() }));

api.notFound((c) => c.json({ error: { code: 'not_found', message: 'No such endpoint' } }, 404));
api.onError((err, c) => {
  console.error('[api]', err);
  return c.json({ error: { code: 'internal', message: 'Something went wrong on our side' } }, 500);
});
