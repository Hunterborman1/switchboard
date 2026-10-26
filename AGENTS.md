# Working on Switchboard

Read [README.md](README.md) first: what this is, what is real and simulated, and how it runs.

## Where things are decided

- **Contracts:** `src/shared/contracts.ts` (runs, insights, deliveries, the API surface) and
  `src/shared/platform.ts` (connectors, channels, people, analyses). Change them first; they are
  the agreement between the Worker, the pipeline and the UI.
- **Pipeline:** `src/pipeline/run.ts` orchestrates ten steps; every step writes a timed row the UI
  and the walkthrough animate from. Keep `src/pipeline/` free of Cloudflare imports.
- **Design:** `docs/DESIGN.md` and `src/ds/`. Build UI only from `src/ds` and the domain components
  in `src/app/components/domain.tsx`; no raw colours, no new component libraries.
- **Walkthrough:** `src/tour/script/` (steps, copy, chapters, notes) over anchors in
  `src/tour/anchors.ts`. Moving or renaming a control means updating its anchor and the tour copy.

## Rules

- Mark anything not fully built as simulated, in the UI and in docs. Never imply a message was sent
  to a real tool.
- Every number on screen is read from data or labelled as an assumption.
- Never print or commit secrets (`.env`, `.dev.vars`, tokens, signed links, the owner link).
- Deploys, remote D1 writes, reseeds, secret pushes and link revocation need Hunter's go-ahead
  (the `signal-loop-operate` skill).
- Comments say why, briefly. Copy is plain English, sentence case, for a VP of Customer Success.

## Before you call it done

```sh
npm run typecheck
npm test
npx playwright test --project=app --project=tour-desktop
```

Screenshot changed pages at 1440, 1024 and 390 wide: no overlaps, clipping or horizontal scroll.

## Skills

Task guides live in `.claude/skills/`:

| Skill | Use it to |
|---|---|
| `add-connector` | Make a simulated connector real, or add a new tool |
| `manage-people` | Edit employees, roles and handles; sync a directory |
| `connect-sso` | Put SSO (Cloudflare Access, Okta, Google) in front of the app |
| `add-analysis` | Build another analysis on the platform |
| `connect-claude` | Use or extend the MCP server |
| `signal-loop-extend` | Change the walkthrough or register an agent in Agent Ops |
| `signal-loop-operate` | Deploy, roll back, links, budget kill switch, reseed |
| `signal-loop-present` | Rehearse or present the walkthrough |
| `signal-loop-qa` | Answer panel questions with cited numbers |
