# src/web: the site shell

This is the entry point of the browser app. It owns the router, the hub, the presenter view and
the write-up and Q&A pages. The product (`src/app`) and Agent Ops (`src/platform`) plug into it.

Every route sits under `/repo/invoca` (`BASENAME` in `router.tsx`, `base` in `vite.config.ts`).

## Routes

| Path | What it shows | Code |
|---|---|---|
| `/` | The hub: three ways in | `pages/Hub.tsx` |
| `/walkthrough/:part` | The presentation scenes | `pages/Walkthrough.tsx`, scenes from `src/narrative/` |
| `/write-up`, `/backup/:topic` | The write-up and the Q&A pages | `pages/`, content from `src/shared/writeup/` |
| `/app/*` | Switchboard and Signal Loop | `src/app/`, through `bridge.ts` |
| `/ops/*` | Agent Ops | `src/platform/`, through `bridge.ts` |
| `/presenter` | The speaker's second screen | `pages/Presenter.tsx` |

## Read first

- `main.tsx`: loads fonts and CSS in order, then mounts the router.
- `router.tsx`: every route, plus the 404 page.
- `RootLayout.tsx`: wraps every route except `/presenter` in the `TourProvider`. It adds the Guide
  on product pages and the chapter tools on scenes.
- `bridge.ts`: loads the product and Agent Ops with `import.meta.glob`. The shell has no hard
  import of either one.
- `mounts.tsx`: the `/app` and `/ops` mount points. In dev, `?dev=1` swaps in the walkthrough's
  test harness (`src/tour/dev/DevHarness.tsx`).
- `RouteError.tsx`: the error page. After a deploy, a missing code chunk reloads the page once.

## How it connects

- The walkthrough engine and the Guide come from `src/tour/`. The scene frame comes from
  `src/narrative/`.
- `bridge.ts` passes walkthrough state to the product (`setTourState` in `src/app/state.ts`) and
  sends walkthrough usage events to Agent Ops.
- The presenter view talks to the main window over a `BroadcastChannel`. Both windows must be in
  the same browser profile.

## Change it safely

- A new or renamed route must also change `src/tour/script/routes.ts` and the Guide's nudges in
  `src/tour/guide/nudges.ts`.
- Write-up and Q&A text lives in `src/shared/writeup/`, not in the page code.
- Tests: `npx playwright test --project=tour-desktop` covers the hub, scenes, presenter and
  write-up. Add `--project=tour-mobile` for layout changes. Then run `npm run typecheck`.
