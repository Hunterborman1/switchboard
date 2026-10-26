# src/pipeline: the ten steps

This is Signal Loop's pipeline: the ten steps every conversation goes through. It is plain
TypeScript with no Cloudflare imports. The Worker runs it for live runs, and Node scripts run the
same code for seeding, evals and replays.

## The steps

| Step | What it does | Code |
|---|---|---|
| `ingest` | Stores the raw text with its hash and marks the run as running | `run.ts` |
| `normalize` | Detects the format and splits it into speakers and turns | `parse.ts` |
| `redact` | Replaces personal and health details with tokens before any model sees the text | `redact.ts` |
| `screen` | Triage by the decision model: what it is, is it actionable, any prompt injection | `run.ts`, prompt in `src/shared/prompts/screen.ts` |
| `extract` | The main model pulls out typed insights, each with a verbatim quote | `run.ts`, `chunk.ts` for long inputs |
| `ground` | Checks every quote against the redacted text, in code | `ground.ts` |
| `score` | Scores and gates each insight, with a second opinion from the decision model | `score.ts` |
| `theme` | Groups similar insights into themes, in code. A model only names them | `theme.ts` |
| `route` | Picks the owner and channel from an editable rules table | `route.ts` |
| `deliver` | Builds the simulated delivery for each tool, with who is tagged and a receipt | `deliver.ts` |

Triage and extraction start at the same time. Extraction is thrown away if triage says nothing
is actionable.

## Read first

- `run.ts`: `runPipeline`, which runs the steps in order. Each step reports a row (running, then
  passed, warned, failed or skipped) through `deps.onStep`. The Run view animates from those rows.
- `types.ts`: `PipelineDeps`, everything the pipeline needs from outside. That covers the model
  client, embeddings, the vector search, the store and the clock.
- `score.ts`: the confidence bands and the rules that always send an item to review.
- `replay.ts`: plays a recorded run back at its recorded pace.

## How it connects

- The Worker supplies `PipelineDeps` (`src/worker/deps.ts`) and runs the pipeline in
  `src/worker/execute.ts` and `src/worker/workflow.ts`.
- Scripts supply an in-memory store (`scripts/lib/memstore.ts`) and call the same `runPipeline`.
- Contracts, prompts and thresholds come from `src/shared/`.

## Change it safely

- Keep it free of Cloudflare and Node-only imports. Everything environment-specific comes in
  through `PipelineDeps`.
- The model never picks the owner. Routing stays in the rules table.
- No quote, no insight. An insight whose quote does not ground is dropped and counted.
- Steps must stay idempotent: rows are keyed so a resumed Workflow can redo a step safely.
- A new step key touches the Run view, replays, the walkthrough and the MCP tools. Avoid it unless
  you need it.
- Tests: `npx vitest run --project unit tests/unit/pipeline`, then `npm test`. A prompt or
  scoring change also needs `npm run eval`, which spends on the build key.
