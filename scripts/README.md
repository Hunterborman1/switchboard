# scripts: seeding, data, evals and deploy

Node scripts for everything outside the running app. Node 24 runs the TypeScript directly, with
no build step. Most are wired to npm scripts in `package.json`.

Scripts that call a model use the build key, never the runtime key. They need
`node --env-file=.env` (the npm scripts add it). Both model clients stop at a hard budget cap.
`lib/llm.ts` logs every call to `.wrangler/build-spend.jsonl`. `data/lib/llm.ts` caches its
calls on disk.

## Local setup and access

| Script | npm script | What it does |
|---|---|---|
| `lib/dev-vars.ts` | `dev:vars` | Writes `.dev.vars` for `wrangler dev` from `.env` |
| `seed.ts` | `db:seed:local`, `db:seed:remote` | Loads `data/` into the Switchboard D1 and Vectorize. Never touches viewer workspaces |
| `platform/seed.ts` | `db:seed:platform:local`, `db:seed:platform:remote` | Migrates and seeds the Agent Ops D1 with the simulated history |
| `sign-link.ts` | `sign-link` | Issues a signed access link (7 days by default). The output is a secret |
| `owner-link.ts` | | Prints the owner sign-in link. The output is a secret |
| `lib/dev-cookie.ts` | | Prints the password cookie for local API testing |
| `deploy.ts` | `deploy` | Build, typecheck, migrate both D1s, push secrets, deploy |

## Data and evals (spend on the build key)

| Script | npm script | What it does |
|---|---|---|
| `data/*.ts` | | Builds the fictional world and the 266-file library. See below |
| `backfill.ts` | `backfill` | Runs the non-featured files through the real pipeline to make the seeded history |
| `record-replays.ts` | `replays:record` | Records a real run of every featured file into `data/replays/` |
| `eval.ts` | `eval` | Scores prompt v4 and candidate v5 on the golden files and applies the promotion gate |
| `verify-data.ts` | `verify:data` | Runs every featured file end to end and writes `docs/reports/verify-data.md` |
| `decision-speed-test.ts` | | Measures candidate decision models. Results are in `docs/reports/decision-models.md` |
| `evals-derive.ts` | | Recomputes per-level precision in `data/evals/latest.json` from the saved details. No model calls. `--check` fails if the file is out of date |

## Checks and housekeeping

| Script | npm script | What it does |
|---|---|---|
| `lib/e2e-local.ts` | `e2e:local` | A smoke test against a running `wrangler dev` on port 8797 |
| `platform/cleanup-test-workspaces.ts` | | Removes Agent Ops rows left by automated test runs. Dry run unless `--apply` |
| `platform/simulate.ts` | | Prints a summary of the simulated Agent Ops history. `platform/seed.ts` uses it |

Shared helpers in `lib/`:

- `core.ts` runs files through the pipeline from Node.
- `memstore.ts` is an in-memory store for the pipeline.
- `match.ts` matches predictions to golden labels.
- `llm.ts` and `embed.ts` call the models.

## The data pipeline

Run in this order: `data/world.ts`, `data/scenarios.ts`, `data/generate.ts`, `data/build.ts`,
`data/check.ts`. Each file's header shows its exact command. Model calls are cached in
`data/.cache/`, so a rebuild costs nothing. [docs/data-review.md](../docs/data-review.md) explains
each step and how the data was checked.

## Change it safely

- Remote seeding, cleanup with `--apply`, links and deploys need Hunter's go-ahead. Never print
  links, tokens or `.env` values.
- Pipeline code belongs in `src/pipeline/`. Scripts only supply Node versions of its dependencies.
- Tests: `npx vitest run --project unit tests/unit/data` for the data pipeline. Run `npm test`
  after changing anything in `lib/`.
