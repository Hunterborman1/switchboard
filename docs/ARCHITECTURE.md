# Signal Loop architecture (brief)

One Cloudflare Worker behind `repos.hunterborman.com/repo/invoca`: the gate, the JSON API, the SPA assets, the pipeline and the Agent Ops platform. Two D1 databases: `invoca-signal-loop` (`DB`) and `invoca-agent-ops` (`PLATFORM_DB`).

## Live runs: fast path first, durable Workflow as the fallback

The 10-step pipeline (`src/pipeline/run.ts`) is one runtime-agnostic core. How it executes in the Worker:

```
POST /api/runs ─ budget reserve ─ insert run ─▶ 201
                                   │
                                   └─ ctx.waitUntil(fastPath)          src/worker/execute.ts
                                        same runPipeline core, same run_steps rows, same telemetry
                                        ├─ finished ─────────────▶ finalize (run row, budget settle, run span/log/work unit)
                                        └─ a step threw, or the fast-path budget (18s) ran out
                                             └─▶ PipelineWorkflow.create({ resume: completed step results })
                                                   skips completed steps; runs the rest under step.do
                                                   (retries, backoff, timeouts); finalizes the run
```

- **Why:** a Workflow instance takes seconds to start in production, and every `step.do` adds a few hundred milliseconds. The fast path removes both from the normal case. The Workflow stays the durability and retry path, so "durable steps" remains true: any step that fails (or a run that runs long) continues on the Workflow from the last completed step.
- **Idempotent steps.** Step rows are upserts keyed by `(run_id, key)`; insights, themes, deliveries and notifications are keyed by id, and the resumed Workflow reuses the ids the fast path produced. A failed fast-path step row is held back, because the Workflow retries that step and writes the row.
- **Stalls.** If the isolate dies mid-run (no progress and no Workflow after 40s), reading the run hands it to the Workflow from the first step (`recoverStalled` in `src/worker/runs.ts`). Library files also keep the replay fallback: a live run that fails, or isn't finished within 25s, becomes a replay of its recorded run.
- **Writes.** All D1 writes for a run go through one ordered `WriteQueue` (`src/worker/writeQueue.ts`). It coalesces statements into `db.batch()` round trips while the next step computes, and checks before each batch that the run is still live. The Workflow drains the queue at the end of each step, so a completed step's writes are committed.
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
