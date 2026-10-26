---
name: manage-people
description: Edit Switchboard's people directory (employees, roles, titles, product areas, per-tool handles), change who owns routing rules, change the default acting user, or sync the directory from an HRIS or identity provider (SCIM, Okta, Google, BambooHR). Use when asked to add, edit or remove employees or to connect a directory.
---

# Manage people

People are who Switchboard can tag: rule owners, CSMs on accounts, watchers. There are two layers.

| Layer | Where | Who changes it |
|---|---|---|
| Seed directory (every workspace starts from it) | `data/world/people.json` (+ `departments.json`), loaded into D1 `people` by `scripts/seed.ts` | A developer, then a reseed |
| Workspace edits (copy-on-write) | D1 `workspace_people`, via `src/worker/directory.ts` | Anyone in the app (People page) or the API |

Contracts: `Person` in `src/shared/contracts.ts`; `PersonInput`, `PersonIdentities`,
`PERSON_ROLES` in `src/shared/platform.ts`. API: `GET/POST /api/people`, `PUT/DELETE
/api/people/:id`, `GET/PUT /api/me` (routes in `src/worker/api/switchboard.ts`).

## Edit in the app

People page (`/app/people`): add, edit handles per tool, remove (keeps history; their routing rules
move to product ops triage), restore, and "act as" for the user menu. Changes stay in the viewer's
workspace.

## Edit the seed directory

1. Edit `data/world/people.json`: `id` (`ppl_<first>`), `name`, `role` (one of `PERSON_ROLES`),
   `title`, `productArea` or null, `slackHandle`, `email`, `initials`, optional `identities`
   (`jira`, `linear`, `salesforce`, `teams`, `email`, `slack`).
2. Keep routing rules valid: every `ownerId` in `data/world/routing.json` must exist, and exactly
   one person should have role `triage` (the fallback owner, `triageOwner` in `src/pipeline/route.ts`).
3. Accounts reference CSMs by id (`csmId` in `data/world/accounts.json`).
4. Reseed: `npm run db:seed:local`, then (with Hunter's go-ahead) `npm run db:seed:remote`.
5. The default acting user is `DEFAULT_ACTOR_ID` in `src/shared/platform.ts` (must be an admin per
   `isAdminPerson`).
6. Run `npm test` (fixtures in `tests/fixtures/world.json` mirror the directory for tests).

## Sync from a directory (design)

- **SCIM 2.0** (Okta, Entra, Google): add `/repo/invoca/scim/v2/Users` routes behind a bearer token
  stored as a Wrangler secret; map `userName`/`emails` → `email`, `name.formatted` → `name`,
  `title`, a department or group → `role` and `productArea`, `active` → `active`. Write to the seed
  `people` table (organisation-wide), not `workspace_people`.
- **Pull from an HRIS** (BambooHR, Workday): a scheduled job (production: Trigger.dev) that upserts
  the same fields and deactivates leavers; deactivation must reassign their rules (see
  `deactivatePerson` in `src/worker/directory.ts`).
- Handles for tagging come from each tool's user lookup by email (Slack `users.lookupByEmail`, Jira
  user search), cached in `identities`.
- With SSO (`connect-sso` skill), the signed-in user becomes the actor instead of "act as".
