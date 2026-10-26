/**
 * Routes the walkthrough drives to (relative to the router basename '/repo/invoca').
 * Kept in one place so they match src/app/routes.tsx and src/platform exactly.
 */
export const R = {
  hub: '/',
  scene: (part: string) => `/walkthrough/${part}`,
  // Switchboard (the platform)
  overview: '/app/overview',
  connections: '/app/connections',
  connection: (id: string) => `/app/connections/${encodeURIComponent(id)}`,
  people: '/app/people',
  analyses: '/app/analyses',
  // Signal Loop (the analysis)
  newCall: '/app/new',
  run: (id: string) => `/app/runs/${encodeURIComponent(id)}`,
  review: '/app/review',
  routing: '/app/routing',
  destinations: '/app/destinations',
  themes: '/app/themes',
  theme: (id: string) => `/app/themes/${encodeURIComponent(id)}`,
  loop: '/app/loop',
  evals: '/app/evals',
  health: '/app/health',
  // Agent Ops (the platform)
  ops: '/ops',
  opsRegistry: '/ops/agents',
  opsAgent: (id: string) => `/ops/agents/${encodeURIComponent(id)}`,
  opsUsage: '/ops/usage',
  opsLogs: (runId?: string | null) => (runId ? `/ops/logs?runId=${encodeURIComponent(runId)}` : '/ops/logs'),
  opsTrace: (traceId: string) => `/ops/traces/${encodeURIComponent(traceId)}`,
  opsReliability: '/ops/reliability',
} as const;
