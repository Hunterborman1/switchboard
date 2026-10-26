# src/platform: Agent Ops

Agent Ops is the product for operating agents, at `/ops`. It shows who owns each agent, what it
returns, what it costs, its logs and traces, and how it scores against a nine-check standard.
Signal Loop is the real agent. The second agent (an RFP responder) and the six weeks of history
are simulated.

The code is in two places:

- `src/platform/`: the UI.
- `src/worker/platform/`: the API, the SDK agents report through, and the maths behind every number.

## Pages

| Sidebar group | Pages |
|---|---|
| Platform | Overview (`/ops`, with the exec summary at `/ops/summary`), Agent registry (`/ops/agents`, one agent at `/ops/agents/:id`), Usage |
| Observe | Logs and traces (`/ops/logs`, one trace at `/ops/traces/:traceId`), Reliability, Cost |
| Govern | Standard and reviews (`/ops/standard`) |

Only a real agent has its own page. A simulated agent's URL goes back to the registry.

## Read first

- `src/platform/index.ts`: the routes. `PlatformShell.tsx`: the sidebar, the top bar and "About
  this data".
- `src/platform/ui/kit.tsx`: one component per Agent Ops concept, such as agent status or a
  standard score. `ui/charts.tsx`: the charts.
- `src/worker/platform/sdk.ts`: the only way an agent reports in. It writes logs, spans, usage
  events and work units, and flushes them in the background.
- `src/worker/platform/api.ts`: the HTTP API at `/repo/invoca/api/platform`.
- `src/worker/platform/reports.ts`: the SQL behind each page. `math.ts` finishes every number:
  hours returned, SLO breaches, overdue reviews.
- `data/platform/agents.json`: the registry seed, with both agents and their standard checks.

## How it connects

- Signal Loop reports through the SDK from its API, Workflow and AI layer
  (`src/worker/telemetry.ts`). Each run is one trace, and its trace id is the run id.
- The product sends usage events to `/api/telemetry` (`src/app/telemetry.ts`). The Worker passes
  them to the SDK.
- Agent Ops has its own D1 database (`PLATFORM_DB`, schema in `migrations-platform/`).
- `scripts/platform/simulate.ts` generates the simulated history, and `scripts/platform/seed.ts`
  loads it.

## Change it safely

- Only `src/worker/platform/` may touch `PLATFORM_DB`.
- Telemetry must never slow down or break the agent that sends it.
- Viewers share one password, so privacy matters. The API uses the signed workspace and never
  sends a full workspace id. It also redacts other viewers' live logs and spans.
- Label simulated data and assumptions as such. A baseline stays an assumption until measured.
- To register an agent, follow the
  [`signal-loop-extend` skill](../../.claude/skills/signal-loop-extend/SKILL.md).
- Tests: `npx vitest run --project unit tests/unit/platform`,
  `npx vitest run --project worker tests/worker/platform`, then
  `npx playwright test --project=platform-desktop`. That project starts its own local Worker.
