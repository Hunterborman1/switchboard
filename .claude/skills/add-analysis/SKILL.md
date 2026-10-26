---
name: add-analysis
description: Build another analysis on the Switchboard platform (Follow-ups, Renewal risk, Escalations, Compliance review, Call coaching, or a new one such as the brief's RFP responder or churn watchdog). Use when asked to make a "Not built" analysis real or add a new kind of output from conversations.
---

# Add an analysis

Signal Loop is the one built analysis. The others are entries in `ANALYSES`
(`src/shared/platform.ts`) with `availability: 'not_built'`; triage already tags which ones apply to
each conversation (`ScreenOutput.analyses`).

## Steps

1. **Contract.** Define the output schema in `src/shared/contracts.ts` (Zod), e.g. a `FollowUp` with
   owner, due date, the quote it came from. Every output carries evidence: no quote, no output.
2. **Prompt.** Add `src/shared/prompts/<analysis>.ts` with a versioned system prompt, the JSON
   schema, and a `repair` function, like `extract.ts`. Untrusted text stays inside the data
   delimiters (`conversationBlock` in `src/shared/prompts/context.ts`).
3. **Pipeline.** Add a pure module in `src/pipeline/` and call it from `runPipeline`
   (`src/pipeline/run.ts`) when `screen.analyses` includes the id. Run it in parallel with Signal
   Loop's extraction; reuse grounding (`groundQuote`) for its quotes. Decide whether it needs its own
   step row (a new `StepKey` touches the run view, replays and the walkthrough) or lives inside an
   existing step's detail.
4. **Storage and API.** A migration for its table (workspace-scoped like `insights`), mappers in
   `src/worker/db.ts`, read routes in `src/worker/api/`.
5. **Routing.** Reuse the rules table if outputs go to owners (add a type), or give it its own
   default destinations (`defaultDestinations` in the catalog).
6. **UI.** A page under the analysis's own nav group in `src/app/AppShell.tsx`, built from `src/ds`;
   flip `availability` to `built` and the Analyses page shows it as running.
7. **Evals.** Golden labels in `data/golden/`, a scorer in `scripts/lib/match.ts`, and a gate in
   `src/shared/scoring.ts` before it routes anything automatically.
8. **MCP.** Expose a read tool in `src/worker/mcp/tools.ts`.
9. **Docs.** README's "What's real" table, `docs/WALKTHROUGH.md`, and the walkthrough's platform scene.

## Check

`npm run typecheck`, `npm test`, `npm run eval` (spends on the build key), the product e2e suite.
