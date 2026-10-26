import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NUDGES, nudgeFor } from '../../../src/tour/guide/nudges';
import { ANCHORS } from '../../../src/tour/anchors';

/** Every route the product mounts, read from the route files so a new page can't go without a nudge. */
function routePaths(file: string, prefix: string): string[] {
  const src = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  const paths = [...src.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]!).filter((p) => p !== '*' && p !== 'ops');
  return [prefix, ...paths.map((p) => `${prefix}/${p.replace(/:[a-zA-Z]+/g, 'x_1')}`)];
}

const APP = routePaths('src/app/routes.tsx', '/app');
const OPS = routePaths('src/platform/index.ts', '/ops');

describe('explore mode has a nudge for every screen', () => {
  it.each([...APP, ...OPS])('%s', (p) => {
    const n = nudgeFor(p);
    expect(n.page).not.toBe('This page');
    expect(n.title.length).toBeGreaterThan(5);
  });

  it('covers the pages the brief lists by name', () => {
    const names = NUDGES.map((n) => n.page);
    for (const page of ['Overview', 'Conversations', 'New conversation', 'Conversation', 'Review', 'Insights', 'Themes', 'Theme', 'Routing', 'Deliveries', 'Close the loop', 'Quality', 'Analyses', 'Connections', 'Connection', 'People', 'Usage and health', 'Settings', 'Connect Claude']) {
      expect(names).toContain(page);
    }
  });

  it('distinguishes a list from one of its items', () => {
    expect(nudgeFor('/app/runs').page).toBe('Conversations');
    expect(nudgeFor('/app/runs/run_123').page).toBe('Conversation');
    expect(nudgeFor('/app/themes').page).toBe('Themes');
    expect(nudgeFor('/app/themes/thm_1').page).toBe('Theme');
    expect(nudgeFor('/app/connections/jira').page).toBe('Connection');
    expect(nudgeFor('/ops').page).toBe('Agent Ops overview');
    expect(nudgeFor('/ops/agents/agt_signal_loop').page).toBe('Agent');
  });

  it('"Show me" only points at anchors that exist', () => {
    for (const n of NUDGES) if (n.show) expect(Object.keys(ANCHORS)).toContain(n.show);
  });

  it('marks what is simulated where it matters, and writes plain copy', () => {
    const say = (p: string) => `${nudgeFor(p).title} ${nudgeFor(p).body}`;
    expect(say('/app/connections')).toMatch(/simulated/i);
    expect(say('/app/destinations')).toMatch(/simulated/i);
    expect(say('/ops')).toMatch(/simulated/i);
    for (const n of NUDGES) {
      expect(`${n.title} ${n.body}`).not.toMatch(/→/);
      expect(n.body.split(/\s+/).length).toBeLessThanOrEqual(24);
    }
  });
});
