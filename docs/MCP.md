# Connect Claude (MCP)

Switchboard runs a remote MCP server, so Claude can read the whole project, query the live data and
run the pipeline. Code: `src/worker/mcp/` (server, tools, docs, tokens). Tests:
`tests/worker/mcp.test.ts`.

## Connect

1. Sign in to the app, open **Workspace › Connect Claude**, and create a token. It acts as your
   private workspace for 7 days, or until your access ends, and is shown once.
2. Add the server:

   **Claude Code**
   ```sh
   claude mcp add --transport http switchboard https://repos.hunterborman.com/repo/invoca/mcp \
     --header "Authorization: Bearer <token>"
   ```

   **Claude Desktop** (`claude_desktop_config.json`, needs Node for `mcp-remote`)
   ```json
   {
     "mcpServers": {
       "switchboard": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://repos.hunterborman.com/repo/invoca/mcp", "--header", "Authorization:${AUTH_HEADER}"],
         "env": { "AUTH_HEADER": "Bearer <token>" }
       }
     }
   }
   ```

Claude.ai web connectors need OAuth, which this demo doesn't run.

## What Claude gets

- **Instructions** on connect: what was built in 48 hours, what is real and simulated, where to start.
- **Docs** as tools (`read_doc`) and resources (`switchboard://docs/<name>`): the walkthrough,
  the write-up (`writeup` for the index, `writeup_<chapter>` for each chapter page), the Q&A
  (`questions`, `question_<topic>` with dashes as underscores, e.g. `question_build_vs_buy`),
  README, architecture, the reports (decision model, robustness, data verification), design
  system, runbook and speaker notes.
- **Tools**

| Tool | Does |
|---|---|
| `about` | Orientation: what it is, what's real, how to explore |
| `read_doc` | Full Markdown of a project doc |
| `get_session` | Workspace, model roles and ids, budget, acting user |
| `platform_overview` | What came in, where it went, who was tagged |
| `list_library_files` | The 48 sample files you can process by id |
| `process_conversation` | Run text or a library file through the real pipeline and wait for the result |
| `list_conversations`, `get_conversation` | Runs, with triage, step timing, models, insights, deliveries |
| `list_insights`, `review_queue` | Insights with quotes, gate reasons and the second opinion |
| `review_insight` | Approve, edit or reject an item waiting for review |
| `list_themes` | Themes with ARR at stake and trend; one theme by id |
| `routing_rules`, `list_deliveries` | Who hears about what, and what was sent (simulated) |
| `quality_report`, `usage_and_budget` | Evals and the promotion gate; spend and failures |
| `list_connections`, `list_people`, `list_analyses` | Connectors (simulated), the directory, the catalog |
| `agent_ops_overview`, `agent_ops_trace` | The exec view and a run's span waterfall |

- **Prompts:** `tour` (walk me through it) and `analyze_call` (process and explain a conversation).

## How it works

- Streamable HTTP, stateless: each POST carries one JSON-RPC message or a batch and gets JSON back.
  GET returns 405 (no event stream). Protocol versions 2024-11-05 through 2025-11-25.
- Tools call the same JSON API the product uses, in-process, as the token's workspace. Validation,
  budgets, rate limits, audit rows and Agent Ops telemetry (`via: mcp`) all apply unchanged.
- Writes (`process_conversation`, `review_insight`) change only that workspace. Live runs draw on
  the shared viewer budget; when it's spent, library files replay their recorded runs.

## Tokens

`swb_<payload>.<sig>`: base64url JSON `{ws, exp, jti}`, HMAC-SHA256 under a key derived from
`LINK_SIGNING_SECRET`. Created by `POST /api/mcp/token` from a signed-in session (never over MCP).

- **Revoke one:** add its `jti` to `revoked_links` (same table as signed links).
- **Revoke all:** rotate `LINK_SIGNING_SECRET` (this also revokes signed links and workspace cookies).

## Docs without MCP

One registry, `DOCS` in `src/worker/mcp/docs.ts`, feeds `read_doc`, the resources and the gated
URLs for assistants that don't speak MCP: each doc as Markdown at its repo path
(`/repo/invoca/docs/ARCHITECTURE.md`; the walkthrough also at `/repo/invoca/walkthrough.md`), every
write-up and Q&A page at its URL plus `.md` (`/repo/invoca/write-up.md`,
`/repo/invoca/write-up/<chapter>.md`, `/repo/invoca/backup.md`, `/repo/invoca/backup/<topic>.md`),
`/repo/invoca/switchboard-docs.zip` (the chapters in `write-up/01-signal.md` …, the Q&A in
`questions/<topic>.md`, every repo doc at its repo path, plus an `INDEX.md`) and
`/repo/invoca/llms.txt`. The write-up and Q&A Markdown is rendered from the same data as the
pages (`src/shared/writeup/`). Add a doc there and all of them pick it up. Tests:
`tests/worker/ai-docs.test.ts`.

## Add a tool

Add an entry to `TOOLS` in `src/worker/mcp/tools.ts`: a name, a one-line description that says
when to use it, a JSON Schema, honest `annotations` (`readOnlyHint`), and a `run` that calls the
API through `call`. Return compact objects, not raw rows. Add a case to `tests/worker/mcp.test.ts`.
