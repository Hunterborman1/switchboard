---
name: connect-sso
description: Put single sign-on in front of Switchboard (Cloudflare Access with Okta, Google Workspace or Entra; or OIDC in the Worker), map signed-in users to people and roles, and keep signed links for guests. Use when asked to add SSO, company login, roles or per-user access.
---

# Connect SSO

Today access is a password cookie, a 7-day signed link, or the owner token (`src/worker/gate.ts`,
`checkAccess`), and each viewer gets an anonymous signed workspace. The acting user is chosen in
the user menu (`/api/me`). SSO replaces "who is this" with a verified identity.

## Option A: Cloudflare Access (recommended, least code)

1. In Cloudflare Zero Trust, add a self-hosted application for
   `repos.hunterborman.com/repo/invoca*` with your IdP (Okta, Google Workspace, Entra) and a policy
   (e.g. email domain `invoca.com`, or a group). Note the application's AUD tag and your team domain.
2. Store them as vars/secrets: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`.
3. In `gate.ts`, add a branch before the password check: read the `Cf-Access-Jwt-Assertion` header
   (or the `CF_Authorization` cookie), verify the RS256 JWT against
   `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (cache the keys), check `aud`, `iss`
   and `exp`, and return `{ ok: true, via: 'sso', email }`. Extend `Access` and pass the request
   headers into `checkAccess`.
4. Map the identity: look the email up in the people directory (`getEffectivePeople` in
   `src/worker/directory.ts`); that person is the actor (skip the user menu's "act as" for SSO users,
   or keep it for admins only). Unknown emails get a viewer role and the triage owner as actor.
5. Workspace: key the workspace on the user (e.g. `ws_` + a hash of the email) so a user keeps
   their edits across devices; keep anonymous workspaces for signed-link guests.
6. Keep the password and signed links for the panel, or disable them with a flag once SSO is on.

## Option B: OIDC in the Worker

`/repo/invoca/login` redirects to the IdP's authorize endpoint (PKCE, state, nonce); a callback
route exchanges the code, verifies the ID token, and sets an HttpOnly session cookie signed like the
others. Same mapping as steps 4–6. More code to own than Option A.

## Roles

Add a role to the session (`Session` in `src/shared/contracts.ts`) from IdP groups: `admin`
(settings, connections, people, rules), `reviewer` (review queue), `viewer` (read). Enforce in the
API routes that write (`src/worker/api/*.ts`) and hide controls in the UI; never rely on the UI alone.

## Test

Add cases to `tests/worker/gate.test.ts`: valid token, wrong `aud`, expired, tampered signature,
unknown key id, and that the API still 401s without any credential. Check the sign-in page and the
MCP token route (`POST /api/mcp/token`) under SSO.
