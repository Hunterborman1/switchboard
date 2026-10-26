# Working on Switchboard

Read [README.md](README.md) first. It says what this is, what is real and what is simulated, and
where each part lives. Every folder under `src/` has a short README, and so do `scripts/`,
`data/` and `tests/`. Read the one for the folder you are changing.

## Map

| Area | Folders | Start with |
|---|---|---|
| Walkthrough: 10 chapters, the scenes, the Guide | `src/tour/`, `src/narrative/` | `src/tour/script/chapters.ts`, `src/tour/script/steps.ts` |
| Site: router, hub, write-up and Q&A pages, presenter view | `src/web/` | `src/web/router.tsx` |
| Switchboard with Signal Loop (`/app`) | `src/app/` | `src/app/routes.tsx` |
| Agent Ops (`/ops`) | `src/platform/`, `src/worker/platform/` | `src/platform/index.ts`, `src/worker/platform/sdk.ts` |
| Pipeline | `src/pipeline/` | `src/pipeline/run.ts` |
| Worker: gate, API, runs, MCP server | `src/worker/` | `src/worker/index.ts` |
| Contracts, prompts, write-up content | `src/shared/` | `src/shared/contracts.ts` |
| Design system | `src/ds/` | `docs/DESIGN.md` |

## Where things are decided

- **Contracts.** Change `src/shared/contracts.ts` and `src/shared/platform.ts` first. They are
  the agreement between the Worker, the pipeline and the UI.
- **Pipeline.** `src/pipeline/run.ts` runs the ten steps. Each step writes a timed row that the
  UI and the walkthrough read. Keep `src/pipeline/` free of Cloudflare imports.
- **Design.** Build UI only from `src/ds` and `src/app/components/domain.tsx`. No raw colours and
  no new component libraries. The rules are in `docs/DESIGN.md`.
- **Walkthrough.** The script is in `src/tour/script/`. Product pages mark what the Guide points
  at with anchors from `src/tour/anchors.ts`. If you move or rename a control, update its anchor
  and the step copy. Every product page needs a nudge in `src/tour/guide/nudges.ts`.
- **Write-up and Q&A.** All of the text is in `src/shared/writeup/`. The pages in `src/web/pages/`
  and their Markdown both render from it, so edit the content there.
- **MCP and docs for assistants.** Tools are in `src/worker/mcp/tools.ts`. The `DOCS` registry in
  `src/worker/mcp/docs.ts` feeds `read_doc`, the Markdown URLs, the docs zip and `llms.txt`.
  Registered docs are served byte for byte, and `tests/worker/ai-docs.test.ts` checks that.

## Rules

- Mark anything not fully built as simulated, in the UI and in docs. Never imply a message was
  sent to a real tool.
- Every number on screen is read from data or labelled as an assumption.
- Never print or commit secrets: `.env`, `.dev.vars`, tokens, signed links or the owner link.
- Deploys, remote D1 writes, reseeds, secret pushes and link revocation need Hunter's go-ahead.
  See the `signal-loop-operate` skill.
- Comments say why, briefly. UI copy is plain English in sentence case, for a VP of Customer
  Success.
- When a doc and the code disagree, the code wins. Fix the doc. Leave `docs/PLAN.md` as it is:
  it is the historical build plan.
- A walkthrough change also updates `docs/WALKTHROUGH.md`, and `docs/speaker-notes.md` if the
  spoken lines change.

## Before you call it done

```sh
npm run typecheck
npm run build        # the Worker tests serve the built site from dist/
npm test
npx playwright test --project=app --project=tour-desktop
```

Add `--project=platform-desktop` for Agent Ops changes. Screenshot changed pages at 1440, 1024
and 390 wide: no overlaps, no clipping, no horizontal scroll.

## Skills

Task guides live in `.claude/skills/`:

| Skill | Use it to |
|---|---|
| `add-connector` | Make a simulated connector real, or add a new tool |
| `manage-people` | Edit employees, roles and handles, or sync a directory |
| `connect-sso` | Put SSO (Cloudflare Access, Okta, Google) in front of the app |
| `add-analysis` | Build another analysis on the platform |
| `connect-claude` | Use or extend the MCP server |
| `signal-loop-extend` | Change the walkthrough, or register an agent in Agent Ops |
| `signal-loop-operate` | Deploy, roll back, issue links, flip the budget kill switch, reseed |
| `signal-loop-present` | Rehearse or present the walkthrough |
| `signal-loop-qa` | Answer panel questions with cited numbers |
