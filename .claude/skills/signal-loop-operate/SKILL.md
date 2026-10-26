---
name: signal-loop-operate
description: Operate the deployed Signal Loop Worker at repos.hunterborman.com/repo/invoca. Use when Hunter asks to deploy, roll back, issue or revoke a signed link, print the owner link, check or flip the live-AI budget kill switch, reseed data, clean up test workspaces, or verify the deployment after a change.
---

# Operate the Signal Loop deployment

One Worker (`invoca-signal-loop`) behind `repos.hunterborman.com/repo/invoca`, two D1 databases (`invoca-signal-loop` as `DB`, `invoca-agent-ops` as `PLATFORM_DB`), KV, Vectorize and a Workflow. Config: `wrangler.jsonc`. Architecture: `docs/ARCHITECTURE.md`. Incidents and rollback: `docs/RUNBOOK.md`.

## Safety rules (read before any command)

1. **Never print secrets.** Do not echo, cat, log or paste `.env`, the password, `LINK_SIGNING_SECRET`, `OWNER_TOKEN`, the runtime model key, a signed link URL or the owner link into chat or files. Script output that contains a link goes to Hunter only, and you say "treat this as a secret".
2. **Confirm before every outward action.** Deploy, rollback, remote D1 or KV writes, remote seeding, secret pushes, link revocation and remote cleanup each need Hunter's explicit go-ahead for that action. Read-only checks do not.
3. **Not while the panel has the link.** Do not deploy, reseed or clean up while an issued signed link is active and the panel may be using it, unless Hunter says the change is needed now. Prefer the kill switch or a rollback over a fix-forward during the session.
4. **Commit before deploy.** Deploy only from a committed tree so a rollback target is known.
5. **Credentials.** The npm scripts map Cloudflare credentials from `.env` (`scripts/env.ts`). For raw `npx wrangler` commands, the shell needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` loaded without echoing them.

## Deploy

```
npm run deploy                     # build, typecheck, migrate both D1s, push secrets, wrangler deploy
node scripts/deploy.ts --no-secrets   # same, without re-pushing secrets
```

`scripts/deploy.ts` runs `npm run build`, `npm run typecheck`, `wrangler d1 migrations apply` for both databases with `--remote`, `wrangler secret bulk` (unless `--no-secrets`), then `wrangler deploy`. Before it: `npm run typecheck`, `npm test`, `npx playwright test --project=tour-desktop` green. After it: run the verification checklist below.

## Signed links

- **Issue:** `npm run sign-link -- 7` (days; default 7). Prints JSON with `url`, `expiresAt` and `jti`. Give `url` to Hunter only; record `jti` and `expiresAt` (not the URL) so the link can be revoked.
- **Revoke one:** insert its `jti` into `revoked_links` (`migrations/0001_init.sql`):
  `npx wrangler d1 execute invoca-signal-loop --remote --command "INSERT INTO revoked_links (jti, revoked_at, note) VALUES ('<jti>', datetime('now'), '<reason>')"`
- **Revoke all:** rotate `LINK_SIGNING_SECRET` in `.env` and push secrets. The password keeps working either way.
- A revocation lookup that fails denies the link (fail closed); the password cookie never consults D1 (`tests/worker/gate.test.ts`).

## Owner link

`node scripts/owner-link.ts` prints `…/repo/invoca/?owner=<token>`. Opening it sets `hb_invoca_owner` and strips the token from the address bar. The output is a secret. It generates `OWNER_TOKEN` in `.env` if missing and never prints it otherwise.

## Budget and kill switch

- Viewers share a $15 cap (`wrangler.jsonc` → `BUDGET_LIMIT_USD`); each live run reserves its worst case first (`src/shared/scoring.ts` → `estimateRunCostUsd`); at most 8 unsettled reservations (`MAX_UNSETTLED_RESERVATIONS`). The provider key has its own hard limit.
- **Check (read-only):** the budget gauge on Usage and health (`/app/health`), or `GET /repo/invoca/api/health` while signed in.
- **Flip live AI off by hand** (provider incident, abuse). D1 is authoritative, KV is the fast path; set both. Values are JSON-encoded (`src/worker/db.ts` → `putSetting`):
  - `npx wrangler d1 execute invoca-signal-loop --remote --command "INSERT INTO settings (key, value, updated_at) VALUES ('live_enabled','false',datetime('now')),('live_disabled_reason','\"manual\"',datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"`
  - `npx wrangler kv key put live_enabled false --binding KV --remote`
- **Turn it back on:** set `live_enabled` to `true` in both places (and `live_disabled_reason` to `null`) once spend has headroom.
- Runs replay recorded real executions while live is off; custom uploads show "Live AI budget reached".

## Reseed

- Signal Loop data (world, library, replays, backfill, evals): `npm run db:seed:remote`. Idempotent; never touches viewer workspaces, the AI ledger or the live switch (`scripts/seed.ts` header).
- Agent Ops simulated history: `npm run db:seed:platform:remote`. Replaces simulated and registry rows only; never live rows (`scripts/platform/seed.ts` header).
- Local first: `npm run db:seed:local`, `npm run db:seed:platform:local`.

## Clean up test workspaces

`scripts/platform/cleanup-test-workspaces.ts` removes Agent Ops rows left by automated test runs, so Overview and Usage count real viewers only. Owner and signed-link sessions are always kept.

```
node scripts/platform/cleanup-test-workspaces.ts --remote          # dry run: classify and count
node scripts/platform/cleanup-test-workspaces.ts --remote --apply  # delete (needs go-ahead)
```

Always show Hunter the dry-run counts before `--apply`.

## Rollback

- **Worker or UI:** `npx wrangler deployments list`, then `npx wrangler rollback <version-id>`.
- **Prompt:** set `PROMPT_VERSION` in `src/shared/prompts/extract.ts` back to the last promoted version and redeploy.
- **Routing rule:** revert the rule in Routing; the audit log has before and after.

Rollback does not revert D1 migrations; check `migrations/` and `migrations-platform/` for anything destructive before rolling back across a schema change.

## Verification checklist (after deploy or rollback)

Do not call it done from a deploy log or a single HTTP 200.

1. Without a cookie, `/repo/invoca/app` returns 302 to `/repo/invoca/login?next=…` and `/repo/invoca/api/session` returns 401.
2. Sign-in with the password works (Hunter does it); a valid signed link signs in and strips `k`.
3. The app loads twice in the same browser (cached assets, no chunk 404s).
4. A featured run (Brightline) completes, live or labelled replay; the trace shows every step.
5. Agent Ops → Logs shows that run under one trace id.
6. Health budget gauge reads sensibly; live flag is what you expect.
7. `/repo/invoca/walkthrough.md` and `/repo/invoca/write-up.md` return 200 `text/markdown`, `/repo/invoca/llms.txt` 200 `text/plain` and `/repo/invoca/switchboard-docs.zip` 200 `application/zip` when signed in; each redirects to login without auth.
8. `npx wrangler tail` shows no new errors for a few minutes.
9. Note the deployed version id as the next rollback target.
