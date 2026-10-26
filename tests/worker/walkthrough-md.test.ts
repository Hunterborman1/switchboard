/**
 * /repo/invoca/walkthrough.md: docs/WALKTHROUGH.md bundled into the Worker. It sits behind the
 * same gate as the SPA (302 to login for a page request without auth) and is served as
 * text/markdown with the standard security headers (CSP included) once signed in.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSP } from '../../src/worker/http.ts';
import { ORIGIN, startHarness, type Harness } from './harness.ts';

const URL_MD = `${ORIGIN}/repo/invoca/walkthrough.md`;
const SOURCE = readFileSync(new URL('../../docs/WALKTHROUGH.md', import.meta.url), 'utf8');

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
}, 180_000);
afterAll(async () => {
  await h?.close();
});

describe('walkthrough.md', () => {
  it('is gated: no cookie redirects to the sign-in page and leaks no content', async () => {
    const r = await h.server.fetch(URL_MD, { redirect: 'manual' });
    expect([302, 401]).toContain(r.status);
    if (r.status === 302) expect(r.headers.get('location')).toContain('/repo/invoca/login?next=');
    expect(await r.text()).not.toContain('Signal Loop: the walkthrough');
  });

  it('a forged password cookie is still refused', async () => {
    const r = await h.server.fetch(URL_MD, { redirect: 'manual', headers: { cookie: `hb_invoca=${'0'.repeat(64)}` } });
    expect([302, 401]).toContain(r.status);
  });

  it('with auth it serves the bundled Markdown as text/markdown, with the CSP intact', async () => {
    const r = await h.server.fetch(URL_MD, { redirect: 'manual', headers: { cookie: `hb_invoca=${h.pw}` } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(r.headers.get('content-security-policy')).toBe(CSP);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    const body = await r.text();
    expect(body).toBe(SOURCE);
    expect(body).toMatch(/^---\r?\ntitle:/);
  });

  it('the owner cookie also gets it', async () => {
    const r = await h.server.fetch(URL_MD, { redirect: 'manual', headers: { cookie: `hb_invoca_owner=${h.ownerToken}` } });
    expect(r.status).toBe(200);
  });
});
