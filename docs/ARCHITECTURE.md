# Signal Loop architecture (brief)

One Cloudflare Worker behind `repos.hunterborman.com/repo/invoca`: the gate, the JSON API, the SPA assets, the pipeline and the Agent Ops platform. Two D1 databases: `invoca-signal-loop` (`DB`) and `invoca-agent-ops` (`PLATFORM_DB`).

## Live runs: fast path first, durable Workflow as the fallback

The 10-step pipeline (`src/pipeline/run.ts`) is one runtime-agnostic core. How it executes in the Worker:

```
POST /api/runs ─ budget reserve (sized from input) ─ insert run ─▶ 201
                                   │
                                   └─ ctx.waitUntil(fastPath)          src/worker/execute.ts
                                        same runPipeline core, same run_steps rows, same telemetry
                                        ├─ finished ─────────────▶ finalize (run row, budget settle, run span/log/work unit)
                                        └─ a step threw, or the fast-path budget (18s) ran out
                                             └─▶ claim: UPDATE runs SET workflow_id = <runId> WHERE mode = 'live' AND workflow_id IS NULL
                                                   └─ won → PipelineWorkflow.create({ id: <runId>, resume: completed step results })
                                                        skips completed steps; runs the rest under step.do
                                                        (retries, backoff, timeouts); finalizes the run
```

- **Why:** a Workflow instance takes seconds to start in production, and every `step.do` adds a few hundred milliseconds. The fast path removes both from the normal case. The Workflow stays the durability and retry path, so "durable steps" remains true: any step that fails (or a run that runs long) continues on the Workflow from the last completed step.
- **Idempotent steps.** Step rows are upserts keyed by `(run_id, key)`; insights, themes, deliveries and notifications are keyed by id, and the resumed Workflow reuses the ids the fast path produced. A failed fast-path step row is held back, because the Workflow retries that step and writes the row.
- **Single execution.** A Workflow is only created by whoever wins a conditional `UPDATE` that claims the run under a deterministic instance id (`<runId>` for a fast-path handoff, `<runId>-r` for stalled-run recovery; `claimWorkflow` in `src/worker/execute.ts`). A second claimant changes no row and backs off, and creating an instance that already exists under that id is treated as the same run. So a run never executes twice. A Workflow whose retries are exhausted marks the run failed and settles its reservation.
- **Stalls.** If the isolate dies mid-run (no progress and no Workflow after 40s), reading the run claims it and hands it to the Workflow from the first step (`recoverStalled` in `src/worker/runs.ts`). Library files also keep the replay fallback: a live run that fails, or isn't finished within 25s, becomes a replay of its recorded run (itself a conditional `UPDATE ... WHERE mode = 'live'`).
- **Duplicates.** `POST /runs` is idempotent by SHA-256: the same bytes return the newest earlier run (this workspace first, then seeded history) with `duplicate: true` and `duplicateScope`. New call then offers "Open your earlier run" (the Run view labels it an earlier run, replayed from saved steps) or "Run again live", which sends `rerun: true`. A rerun skips only this workspace's own runs of the same file; seeded history and a different file with the same bytes (the duplicate re-upload test) still dedupe, and the budget reservation and rate limits apply as usual. The walkthrough always sends `rerun: true`, so a restarted tour runs live again.
- **Writes.** All D1 writes for a run go through one ordered `WriteQueue` (`src/worker/writeQueue.ts`). It coalesces statements into `db.batch()` round trips while the next step computes. Every batch starts with a liveness guard statement inside the same transaction, which aborts the batch unless the run is still live, so a run a replay has taken over commits nothing (no check-then-write race). The Workflow drains the queue at the end of each step, so a completed step's writes are committed.
- **Spend ledger.** `ai_calls` rows are written directly, not through the liveness-guarded queue, so spend is recorded even for a run that was superseded mid-call. Timeouts and aborts are ledgered at their estimated cost, and executors drain in-flight calls before they end.

## Budget

`src/worker/budget.ts`. Viewers share a hard cap (`BUDGET_LIMIT_USD`, $15) on the `ai_calls` ledger.
- **Reservation sized from the input.** Each live run reserves its worst case before it starts (`estimateRunCostUsd` in `src/shared/scoring.ts`: screen, extract and theme naming at max output, three attempts each, priced at the dearer model, plus 20%), with one conditional INSERT that is atomic in D1, so concurrent runs cannot overshoot. The reservation is settled after theme naming.
- **At most 8 unsettled reservations** at once across all viewers (`MAX_UNSETTLED_RESERVATIONS`); past that, a library file replays its recorded run and a custom upload gets a 429 (`live_busy`) rather than queueing. Per-workspace and per-IP rate limits (`RL_RUNS`, `RL_RUNS_IP`) fail closed.
- **Live off.** When what remains cannot cover another run, or the provider answers 402 (key out of credit), live AI flips off in D1 settings and KV, and runs replay recorded executions. Owner runs count against the cap too. See [RUNBOOK.md](RUNBOOK.md).

## Access and request safety

`src/worker/gate.ts`, `src/worker/http.ts`.
- **Viewers:** the password (`INVOCA_PASSWORD` → `hb_invoca`) or a 7-day signed link (`hb_invoca_link`). Sign-in is rate-limited per IP (`RL_UNLOCK`, fail closed).
- **Owner:** `?owner=<OWNER_TOKEN>` sets `hb_invoca_owner`, an HMAC under `OWNER_TOKEN`. Nothing on the shared host (the old `hb_auth` / `SITE_PASSWORD` bypass) grants owner any more.
- **Workspaces:** `sl_ws` is HMAC-signed (`ws_<16 hex>.<sig>`); an unsigned or forged value gets a fresh workspace. Agent Ops reads the verified workspace and redacts other viewers' live logs and spans.
- **CSRF:** state-changing API requests must be same-origin, carry a JSON body and the header `x-signal-loop: 1` (sibling `/repo/*` apps share the origin, and a plain form post cannot send the header). The client fetch wrappers send it.
- **Assets:** hashed assets are served immutable and 304 revalidations pass through; a missing hashed asset is a 404, never `index.html`.
- **Latency work on the hot path.**
  - Extraction starts alongside the screen call, on the same redacted input. It is only used once screen has passed, and it is discarded (cost kept on the run) if screen says nothing is actionable.
  - Theme nearest-neighbour queries run in parallel.
  - New candidate themes are named with one batched LLM call after the run has finished. Membership is decided in code, so it is unchanged; themes show a deterministic name until the call returns.
  - Agent Ops telemetry flushes in the background.
- **Replays** reveal recorded runs at the same pace (`fastPathTiming` in `src/pipeline/replay.ts`). The Run view still reveals one step at a time with a minimum dwell (`useReveal`), so a fast run stays watchable.

## Observability

Signal Loop reports into Agent Ops only through `src/worker/platform/sdk.ts`. Each run gets one trace (`traceId = runId`) with a span per step, AI call and delivery. It also emits these logs:
- `step.*`
- `ai.call`
- `grounding.checked` `{passed, total, dropped}`, which feeds the grounding SLO
- `run.handoff` (fast path → Workflow)
- `run.finished` `{executor: fast_path | workflow}`
