# src/app: the Switchboard product

This is the product at `/app`. Switchboard takes conversations in and sends results out. Signal
Loop is the one analysis built inside it, so its pages sit in their own group in the sidebar.

## Pages

Each route in `routes.tsx` maps to one file in `pages/`. A page's subfolder holds its parts and
CSS modules.

| Sidebar group | Pages |
|---|---|
| (top) | Overview, Conversations (`Runs.tsx`, `RunView.tsx`), New conversation (`NewCall.tsx`) |
| Signal Loop | Review, Insights, Themes (`Themes.tsx`, `ThemeDetail.tsx`), Routing, Deliveries (`Destinations.tsx`), Close the loop (`Loop.tsx`), Quality (`Evals.tsx`) |
| Workspace | Analyses, Connections (`Connections.tsx`, `ConnectionDetail.tsx`), People, Usage and health (`Health.tsx`), Settings, Connect Claude (`Claude.tsx`) |

## Read first

- `routes.tsx`: every `/app` route. Pages load lazily.
- `AppShell.tsx`: the sidebar, the top bar with the "Live AI" status, the product switcher and
  the user menu. It is built on `Shell` from `src/ds`.
- `api/client.ts` and `api/hooks.ts`: the typed API client and the data hooks pages use.
- `components/domain.tsx`: shared badges and labels, such as `TypeLabel`, `GateBadge` and
  `RunStatusBadge`. Use them instead of restyling a concept on each page.
- `index.ts`: the public surface that the site shell imports.

Other folders:

- `components/`: the library picker, the insight drawer, evidence in context and the delivery
  previews for each kind of tool.
- `lib/convert/`: turns an uploaded file (PDF, Office, text) into text in the browser. Only the
  text is sent.
- `state.ts`: the walkthrough state the product reads. `telemetry.ts`: usage events for Agent Ops.
  Add `?notrack=1` to turn them off.
- `api/fixtures.ts` and `api/fixtures-data.ts`: a dev-only, in-memory workspace. It answers every
  API call when `VITE_FIXTURES=1` is set.
- `dev/`: a fixture-mode harness (`dev/index.html`, hash routing). The `app` Playwright project
  runs against it.

## How it connects

- It calls the Worker's API at `/repo/invoca/api` (`src/worker/api/`). The shapes come from
  `src/shared/contracts.ts` and `src/shared/platform.ts`.
- `src/web` mounts it at `/app` through `src/web/bridge.ts`.
- For the walkthrough, pages place anchors from `src/tour/anchors.ts` and emit events from
  `src/shared/events.ts`. The product never imports the walkthrough engine.
- Agent Ops reuses its session hook (`useMe` in `api/hooks.ts`).

## Change it safely

- Build only from `src/ds` and `components/domain.tsx`. Follow [docs/DESIGN.md](../../docs/DESIGN.md).
- Connectors are simulated. Say so on screen wherever it matters.
- Show model roles ("Decision model", "Main model", "Backup model"). Exact model ids appear only
  on Settings.
- If you move or rename a control the walkthrough points at, update its anchor and the step copy
  in `src/tour/script/`. A new page needs a route, a nudge in `src/tour/guide/nudges.ts`, and an
  entry in `src/tour/script/routes.ts` if a step opens it.
- Tests: `npx playwright test --project=app` (fixture mode, no Worker needed) and
  `npx vitest run --project unit tests/unit/app`. Screenshot changed pages at 1440, 1024 and
  390 wide.
