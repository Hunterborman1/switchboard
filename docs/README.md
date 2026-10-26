# Docs

The project's long-form docs. Start with the [root README](../README.md) for what this is and
where the code lives.

| Doc | Read it for |
|---|---|
| [WALKTHROUGH.md](WALKTHROUGH.md) | The presentation chapter by chapter: what each shows and why, with sources. Also the decisions (ADRs) and honest gaps |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How a run executes: the fast path and Workflow, models, budget, access, connectors and people |
| [MCP.md](MCP.md) | Connecting Claude, the tools, tokens, and adding a tool |
| [DESIGN.md](DESIGN.md) | The design system's rules and tokens |
| [RUNBOOK.md](RUNBOOK.md) | Alerts, model fallback, the budget kill switch, rollback and incidents |
| [speaker-notes.md](speaker-notes.md) | What to say in each chapter, and likely questions |
| [data-review.md](data-review.md) | How the synthetic world and the 266 calls were made and checked |
| [reports/](reports/) | Measured results: the decision-model speed test, data verification, robustness |
| [runbooks/](runbooks/) | Runbooks for agents registered in Agent Ops |
| [PLAN.md](PLAN.md) | The original build plan. Historical: parts of it no longer match the code |

## Docs that live elsewhere

- **Write-up and Q&A.** The write-up (one page per chapter) and the Q&A pages are not files here.
  Their text lives in `src/shared/writeup/`, and it renders both as pages and as Markdown.
- **Per-folder READMEs.** Each folder under `src/`, plus `scripts/`, `data/` and `tests/`, has a
  short README with its entry points and the tests to run.
- **For AI assistants.** [AGENTS.md](../AGENTS.md) and the task guides in
  [`.claude/skills/`](../.claude/skills/). The live site also serves the registered docs as
  Markdown, as a docs zip and through the MCP server. The registry is `DOCS` in
  `src/worker/mcp/docs.ts`.

When a doc and the code disagree, the code wins. Fix the doc.
