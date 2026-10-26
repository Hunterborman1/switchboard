# Switchboard

Switchboard reads a customer conversation or document, works out what it is, and sends what
matters to the right people in the tools they already use. **Signal Loop** is the analysis built
inside it. It turns product feedback from CSM calls into insights backed by the customer's own
words, and routes each one to its owner. **Agent Ops** is a second product for running and
measuring agents, starting with Signal Loop.

Hunter Borman built it from scratch in 48 hours for Invoca's AI Operations Lead take-home
(Option 3, the feedback loop). This repo holds three things: the interactive walkthrough, the
Switchboard product with Signal Loop inside it, and Agent Ops.

## Open it

The live site needs a password or a 7-day signed link. Hunter shares one with reviewers.

| Link | What it is |
|---|---|
| [Hub](https://repos.hunterborman.com/repo/invoca/) | The start page, with three ways in |
| [Walkthrough](https://repos.hunterborman.com/repo/invoca/walkthrough) | The presentation: 10 chapters, about 25 minutes, over the real product |
| [Switchboard](https://repos.hunterborman.com/repo/invoca/app/overview) | The product, with Signal Loop inside it |
| [Agent Ops](https://repos.hunterborman.com/repo/invoca/ops) | The product for operating agents |
| [Write-up](https://repos.hunterborman.com/repo/invoca/write-up) | The write-up (one page per chapter) and the Q&A pages |
| [Connect Claude](https://repos.hunterborman.com/repo/invoca/app/claude) | Create a token for the MCP server |
| [Docs zip](https://repos.hunterborman.com/repo/invoca/switchboard-docs.zip), [llms.txt](https://repos.hunterborman.com/repo/invoca/llms.txt) | Every doc as Markdown, for AI assistants |

## What's real and what's simulated

- **Real:** all of the AI. That covers triage, extraction, quote checks, scoring with a second
  opinion, themes, routing, the review queue and evals with a promotion gate.
- **Real:** inputs and outputs. You can upload a file, paste text or pick a sample. Each
  delivery's content, the people it tags and its receipt come from the pipeline.
- **Real:** a $15 cap on live AI spend for all viewers. Past it, runs replay recorded runs.
- **Real:** Agent Ops' logs, traces, usage and cost for Signal Loop, and the MCP server.
- **Simulated:** the 12 connectors (Slack, Jira, Salesforce and others). Connecting one records
  it in your workspace, and deliveries show as previews. Nothing is sent.
- **Simulated:** the data. The 14 accounts, 21 people and 266 sample conversations are fictional.
- **Simulated:** Agent Ops' second agent (an RFP responder) and its six weeks of history.
- **Not built:** five more analyses, such as Follow-ups and Renewal risk. The catalog lists them
  as "Not built".

## What's in this repo

| Part | Folders | Read |
|---|---|---|
| **Walkthrough**: the presentation scenes, the script, and the Guide that docks on product pages | `src/tour/`, `src/narrative/` | [tour](src/tour/README.md), [narrative](src/narrative/README.md) |
| **Switchboard** (with Signal Loop): the product at `/app` | `src/app/` | [app](src/app/README.md) |
| **Agent Ops**: the product at `/ops`, its API and its SDK | `src/platform/`, `src/worker/platform/` | [platform](src/platform/README.md) |
| **Site shell**: router, hub, write-up and Q&A pages, presenter view | `src/web/` | [web](src/web/README.md) |
| **Pipeline**: the ten steps every conversation goes through | `src/pipeline/` | [pipeline](src/pipeline/README.md) |
| **Worker**: sign-in gate, API, runs, budget, MCP server | `src/worker/` | [worker](src/worker/README.md) |
| **Design system**: tokens, components, the app shell | `src/ds/` | [ds](src/ds/README.md) |
| Shared code: contracts, prompts, catalog, write-up content | `src/shared/` | [shared](src/shared/README.md) |
| Scripts: seeding, data generation, evals, deploy, links | `scripts/` | [scripts](scripts/README.md) |
| Data: the fictional world, sample files, labels, recordings | `data/` | [data](data/README.md) |
| Tests: unit, Worker and end-to-end | `tests/` | [tests](tests/README.md) |
| Database schema, one folder per D1 database | `migrations/`, `migrations-platform/` | |
| Docs: architecture, design, runbook, walkthrough, reports | `docs/` | [docs](docs/README.md) |

## How it works

The browser turns a file into text and posts it to the API. One Cloudflare Worker then runs ten
steps: ingest, read, remove personal details, triage, extract, check quotes, score, theme, route
and deliver. Triage and extraction run at the same time. Quote checks and routing are plain code.
An editable rules table picks each owner, never the model. Every step is stored with its timing,
model, tokens and cost.

Three model roles run on OpenRouter: a decision model, a main model and a backup model. They were
chosen by measurement, and their ids are in `wrangler.jsonc`. State lives in two D1 databases,
similarity search in Vectorize, and the live-AI switch in KV.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The decisions, and what each one beat,
are the ADRs in [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md#architecture-and-decisions).

## Run it locally

You need Node 24 or later, and a Cloudflare account for remote resources. Copy `.env.example` to
`.env` and fill in what you need.

```sh
npm ci
npm run dev:vars                 # write .dev.vars for wrangler dev, from .env
npm run db:migrate:local         # create the local Switchboard database
npm run db:seed:local            # load the sample data into it
npm run db:seed:platform:local   # create and seed the local Agent Ops database
npm run dev:worker               # the Worker on http://127.0.0.1:8797
npm run dev                      # the site on http://localhost:5178/repo/invoca/
```

`npm run dev` proxies the API to the Worker. To skip the Worker, run `VITE_FIXTURES=1 npx vite`.
The site then answers from an in-memory workspace, the same mode the end-to-end tests use.

## Test

```sh
npm run typecheck
npm run build                    # the Worker tests serve the built site from dist/
npm test                         # unit and Worker tests (Vitest)
npx playwright test --project=app --project=tour-desktop
```

`npx playwright test` with no project runs every suite, including Agent Ops against a local
Worker. [tests/README.md](tests/README.md) says which suite covers what.

## Deploy

`npm run deploy` builds, typechecks, migrates both databases, pushes secrets and deploys the
Worker. Deploys need Hunter's go-ahead. The steps, signed links and rollback are in the
[`signal-loop-operate` skill](.claude/skills/signal-loop-operate/SKILL.md) and
[docs/RUNBOOK.md](docs/RUNBOOK.md).

## Docs

| Doc | Read it for |
|---|---|
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | Every chapter of the presentation, with sources, the ADRs and honest gaps |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How a run executes: models, budget, access, connectors |
| [docs/DESIGN.md](docs/DESIGN.md) | Design system rules and tokens |
| [docs/MCP.md](docs/MCP.md) | Connecting Claude, the tools, tokens |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Alerts, model fallback, the kill switch, rollback |
| [docs/README.md](docs/README.md) | The full docs index |

## For AI assistants

- **MCP:** the Worker runs a remote MCP server with 21 tools. Claude can read the docs, query the
  live data and run the pipeline. Create a token at `/app/claude`, then see
  [docs/MCP.md](docs/MCP.md).
- **Docs zip:** `/switchboard-docs.zip` holds every doc as Markdown, with an `INDEX.md`.
  `/llms.txt` lists the same files. Both need the site's sign-in.
- **This repo:** start with [AGENTS.md](AGENTS.md). Task guides live in
  [`.claude/skills/`](.claude/skills/), for example adding a connector or an analysis.

## Security

- One gate covers the site, the API and the docs: a password, a signed link or the owner token.
  The MCP server uses its own bearer tokens, each scoped to one workspace.
- Each viewer gets a private, signed workspace. Edits never leak between viewers.
- Personal and health details are removed before any model sees the text.
- Spend is capped twice: a ledger in the app and a hard limit on the provider key.
- Secrets live only in `.env` (git-ignored) and Wrangler secrets.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#access-and-request-safety).
