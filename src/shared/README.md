# src/shared: contracts, prompts and shared content

Code that more than one part of the system needs: the Worker, the pipeline, the UI and the
scripts. Everything here is plain data and pure functions. It runs in the browser, in the Worker
and in Node.

## Read first

- `contracts.ts`: Signal Loop's Zod schemas for runs, steps, insights, deliveries and the API.
  Every API response is an `Envelope<T>`: `{ data, dataAsOf }`.
- `platform.ts`: Switchboard's catalog. It lists the 12 connectors (`CONNECTORS`), the channels,
  people and roles, and the analyses (`ANALYSES`, one built and five not built).
- `platform-contracts.ts`: Agent Ops' shared types, including the nine standard checks
  (`STANDARD_CHECKS`) and the telemetry batch.

## Other files

- `prompts/`: versioned prompts, one file each. They cover triage (`screen.ts`), extraction
  (`extract.ts`), the second opinion, theme naming, the eval judge and the taxonomy.
  `context.ts` wraps conversation text as untrusted data.
- `scoring.ts`: the gate thresholds, budget numbers and promotion-gate rules. The Settings page
  shows these values.
- `events.ts`: the event bus from the product to the walkthrough.
- `format.ts`: number formatters. A figure shown in two places goes through the same function.
- `modelLabels.ts`: turns model ids into role names ("Main model").
- `runTiming.ts`: where a run's time went, from its real step rows.
- `writeup/`: all the text of the write-up and the Q&A, plus the code that renders it as Markdown.
  The pages and the Markdown for AI assistants both read from here.

## How it connects

- The UI, the Worker, the pipeline and the scripts all import from here. Both `tsconfig.json`
  and `tsconfig.worker.json` include this folder.
- Every model output is validated against the schemas in `contracts.ts`.

## Change it safely

- Change a contract here first, then update the Worker, the pipeline and the UI to match.
- No DOM, React or Worker imports. Keep it loadable everywhere.
- Prompts carry versions, such as `PROMPT_VERSION` in `prompts/extract.ts`. Score a prompt change
  with `npm run eval` before you promote it.
- `MINUTES_SAVED_PER_CALL` in `scoring.ts` must equal Signal Loop's baseline in
  `data/platform/agents.json`.
- Tests: `npm run typecheck`, then `npx vitest run --project unit tests/unit/shared` and
  `tests/unit/pipeline/prompts.test.ts`.
