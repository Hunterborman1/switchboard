# tests: unit, Worker and end-to-end

Three layers. Vitest runs the unit and Worker tests (`vitest.config.ts`). Playwright runs the
end-to-end suites (`playwright.config.ts`).

## Layout

| Folder | Runner | What it covers |
|---|---|---|
| `unit/` | Vitest project `unit` | Pure code: the pipeline, prompts, file conversion, the data build, Agent Ops maths, shared formatters, the write-up content, the walkthrough script and the Guide's placement |
| `worker/` | Vitest project `worker` | The real Worker on a local D1: the gate, the API, runs, security headers, MCP, the docs for assistants, Agent Ops |
| `e2e/app/` | Playwright project `app` | Product pages in fixture mode. No Worker needed |
| `e2e/tour/` | `tour-desktop`, `tour-mobile` | The walkthrough on the real router, over the fixture-mode product |
| `e2e/platform/` | `platform-desktop`, `platform-tablet`, `platform-mobile` | Agent Ops against a real local Worker with seeded history |
| `fixtures/` | | A small world and sample files, including an injection attempt and a PHI-heavy call |
| `helpers/` | | A deterministic stand-in for the models (`mockModel.ts`) and fixture loaders |

## Run them

```sh
npm run build                     # the Worker tests serve the built site from dist/
npm test                          # unit and Worker
npx vitest run --project unit     # unit only, fast
npx playwright test --project=app --project=tour-desktop
npx playwright test               # every e2e project, including Agent Ops
```

Which suite to run for a change:

| You changed | Run |
|---|---|
| Pipeline, prompts, scoring | `npx vitest run --project unit tests/unit/pipeline` |
| Walkthrough script, copy or the Guide | `npx vitest run --project unit tests/unit/tour`, then `--project=tour-desktop` |
| Product UI | `npx playwright test --project=app` |
| Worker routes, the gate, MCP | `npx vitest run --project worker` |
| Agent Ops | `tests/unit/platform`, `tests/worker/platform`, then `--project=platform-desktop` |

## How the layers work

- **Worker tests** start the real Worker with wrangler's `createTestHarness` (`worker/harness.ts`).
  A local HTTP mock stands in for OpenRouter, so the real AI client still runs. Files run one at a
  time.
- **The mock model** (`helpers/mockModel.ts`) returns verbatim quotes from the transcript, so
  grounding, scoring and routing run on realistic output. Magic words in the text trigger
  failures, such as `HALLUCINATE` or `FORCE_LLM_ERROR`.
- **Fixture mode** (`VITE_FIXTURES=1`) answers every API call from an in-memory workspace in the
  browser. The `app` and `tour-*` projects share one Vite server on port 5179.
- **Agent Ops e2e** starts `wrangler dev` on port 8812 with a local D1 in `.wrangler/ao-e2e`, and
  Vite on port 5192.

Each port can be changed with `APP_E2E_PORT`, `PLATFORM_E2E_PORT` and `PLATFORM_E2E_WORKER_PORT`,
so a second checkout can run the suites at the same time.

## Change it safely

- Tests use fictional data only. Never put real customer text or secrets in fixtures.
- The app and walkthrough specs open pages with `?notrack=1`, so test runs add no usage events.
- A new product page needs a Guide nudge. `unit/tour/nudges.test.ts` checks this against the
  routes.
