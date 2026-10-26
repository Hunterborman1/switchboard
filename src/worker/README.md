# src/worker: the Cloudflare Worker

One Worker serves everything at `repos.hunterborman.com/repo/invoca`. It holds the sign-in gate,
the JSON API, live runs, the budget, the MCP server, the docs for AI assistants and the built
site. Its config is `wrangler.jsonc`. [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) explains
how a run executes.

## What it serves

| Path under `/repo/invoca` | What | Code |
|---|---|---|
| `/login`, `/api/unlock`, `/api/logout` | Sign-in and sign-out (public) | `index.ts`, `login.ts` |
| `/public/*` | Brand assets the sign-in page needs (public) | `index.ts` |
| `/mcp` | The remote MCP server, with its own bearer tokens | `mcp/` |
| `/api/*` | The JSON API, behind the gate | `api/index.ts`, `api/switchboard.ts` |
| `/api/platform/*` | The Agent Ops API | `platform/api.ts` |
| Doc URLs, `/switchboard-docs.zip`, `/llms.txt` | The docs as Markdown, behind the gate | `mcp/docs.ts` |
| Everything else | The built site from `dist/`, behind the gate | `index.ts` |

## Read first

- `index.ts`: the request flow, top to bottom. Its header lists every route.
- `gate.ts`: who gets in. It checks the password cookie, the 7-day signed link and the owner
  token. It also signs each viewer's workspace cookie.
- `api/index.ts`: the API routes for runs, insights, review, themes, routing, evals and health.
- `runs.ts` and `execute.ts`: how a live run starts. It takes a fast path first and hands off to
  the durable Workflow (`workflow.ts`) if a step fails or takes too long.
- `deps.ts`: what the pipeline gets in the Worker. That is the model client (`ai.ts`), Workers AI
  embeddings, Vectorize and a D1 store.
- `budget.ts`: the $15 viewer budget. Each live run reserves its worst-case cost first.

Other modules:

- `db.ts`: D1 access and workspace scoping.
- `review.ts`: approve, edit and reject. `themes.ts` and `overview.ts`: what those pages read.
- `replay.ts`: copies a recorded run into a viewer's workspace and reveals it over time.
- `connections.ts`: the simulated connectors. `directory.ts`: people and the acting user.
- `telemetry.ts`: Signal Loop's reports to Agent Ops.
- `writeQueue.ts`: batches the D1 writes for one run.

## MCP

`mcp/server.ts` speaks MCP over HTTP. `mcp/tools.ts` defines 21 tools. Each one calls the same
API as the product, as the token's workspace. `mcp/token.ts` signs the tokens. `mcp/docs.ts`
holds the `DOCS` registry, which feeds `read_doc`, the doc URLs, the zip and `llms.txt`. See
[docs/MCP.md](../../docs/MCP.md).

## Bindings

- `DB` and `PLATFORM_DB`: the two D1 databases, for Switchboard and for Agent Ops.
- `KV`: the live-AI switch. `VECTORS`: Vectorize, for theme similarity.
- `AI`: Workers AI, for embeddings. `PIPELINE`: the Workflow.
- `RL_RUNS`, `RL_RUNS_IP`, `RL_UNLOCK`: rate limits.

The model ids are vars in `wrangler.jsonc`. Secrets come from `.env` through `npm run deploy`.

## Change it safely

- Every path stays behind the gate except sign-in, `/public/*` and `/mcp`.
- `run_worker_first` in `wrangler.jsonc` must stay on, or assets would skip the gate.
- A write must be same-origin, send JSON and carry the `x-signal-loop: 1` header.
- Each viewer sees the seed data plus their own workspace. Edits are copy-on-write.
- Keep `PLATFORM_DB` inside `platform/`.
- Tests: `npm run build`, then `npx vitest run --project worker`. For a manual check, run
  `npm run e2e:local` against `npm run dev:worker`.
