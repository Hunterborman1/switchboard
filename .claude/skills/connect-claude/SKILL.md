---
name: connect-claude
description: Connect Claude Code or Claude Desktop to Switchboard's MCP server, answer questions through it, or add and change MCP tools. Use when someone wants Claude to explore the project, process a conversation through the live pipeline, or extend what the MCP exposes.
---

# Connect Claude

Full reference: `docs/MCP.md`. Server: `src/worker/mcp/` (server.ts, tools.ts, docs.ts, token.ts).

## Connect

1. Sign in, open **Workspace › Connect Claude** (`/app/claude`), create a token (7 days, one
   workspace, shown once). Treat it like a password.
2. Claude Code:
   `claude mcp add --transport http switchboard https://repos.hunterborman.com/repo/invoca/mcp --header "Authorization: Bearer <token>"`
3. Claude Desktop: the `mcp-remote` config shown on the same page.
4. Ask: "Call `about`, then walk me through what was built and what is simulated."

## Using it well

- Start with `about`, then `read_doc` with `walkthrough`; numbers in answers should come from tools
  (`quality_report`, `usage_and_budget`, `get_conversation`) rather than memory.
- `process_conversation` runs the real pipeline on pasted text or a library file and spends from the
  shared viewer budget; it waits for the result (usually 4–7 seconds).
- Writes only affect the token's workspace.

## Extend

- New tool: add to `TOOLS` in `src/worker/mcp/tools.ts` (schema, honest `readOnlyHint`, a `run`
  that calls the API via `call`, compact output) and a case in `tests/worker/mcp.test.ts`.
- New doc: add the Markdown file under `docs/` and register it in `src/worker/mcp/docs.ts`.
- Revoke a token: its `jti` into `revoked_links`; all tokens: rotate `LINK_SIGNING_SECRET`.
- OAuth for claude.ai web connectors is not implemented; it would sit in front of the same handler
  (e.g. Cloudflare's workers-oauth-provider), with the user's workspace as the grant.
