# Signal Loop: runbook

What to do when Signal Loop misbehaves, and how to change it safely. Linked from the agent page and from every Signal Loop alert in Agent Ops.

## Owners

- **Agent owner (on call):** Hunter Borman, AI Operations. Owns alerts, rollbacks, prompt changes and this runbook.
- **Business owner:** VP Product. Signs the success metric and the kill/rework criteria. In this POC the name on the agent page (Elena Vasquez) is an illustrative record from the synthetic world.
- **Security & data review:** to be completed by Invoca Security. The record on the agent page is illustrative and marked pending until then.

## What users see when it is down

- **Live AI off (budget, provider outage):** new runs replay a recorded real execution and the run view says "replay". Nothing errors.
- **Worker down:** the app fails to load. Routed insights already in Jira, Slack and Linear are unaffected.
- **A step fails:** the run shows the failed step and its error; nothing from that run is routed.

## Alerts

Every alert in Agent Ops → Reliability has expected vs actual, this owner and a link here. Acknowledged means someone is on it; resolved means the rule stopped firing.

| Alert | First move |
|---|---|
| SLO breached: run success, grounding, delivery, p95 latency, cost per unit | Open the linked trace; find the failing step or destination (see Incident steps) |
| Error rate > 5% in an hour (≥ 20 requests) | Check Logs filtered to errors; if one step or provider dominates, see [Model fallback](#model-fallback) |
| AI cost up > 50% week over week | Check Cost by model and prompt version; a prompt that emits more insights costs more (v5 did) |
| Live AI spend > 80% of cap | Decide whether to raise the cap or let it flip to replay (see [Budget kill switch](#budget-kill-switch)) |
| Weekly active users down > 30% | Not an outage: raise it at the weekly review with the business owner |
| Scheduled review overdue | Hold the review; update last/next review in the registry |

## Model fallback

Each model call tries the primary tier, retries once with the schema errors fed back, then falls back to the secondary tier. A high fallback rate means the primary tier is degraded or repriced.

1. Confirm in Agent Ops → Trace that spans show `fallback` and the primary returns errors (for example 503).
2. If the secondary tier is healthy, no action is needed beyond watching cost: fallback is automatic.
3. If both tiers fail, flip live AI off (below) so runs replay instead of failing.
4. Before making the secondary tier primary for good, run the eval suite with it as primary (`npm run eval`) and promote only if the gate holds.

## Budget kill switch

- Viewers share a hard cap (`BUDGET_LIMIT_USD`, $15). Every live run reserves its worst-case cost before it starts; when what remains can't cover another run, live AI flips off and runs replay. A provider 402 (key out of credit) flips it off too.
- The provider key also has its own hard limit, so the in-app ledger is not the only guard.
- **Flip live AI off by hand** (provider incident, suspected abuse): set the `live_enabled` setting to `false` in the `invoca-signal-loop` D1 database (`settings` table, with `live_disabled_reason`), and the `live_enabled` KV key to `false`. D1 is authoritative; KV is the fast path.
- **Turn it back on:** set both back to `true` once spend has headroom or the provider has recovered.

## Replay mode

Replay serves a recorded real execution of a featured file at real speed, labelled "replay" on screen. It costs nothing and needs no model. It is used automatically when live AI is off, over budget, or a live run on a featured file runs past the fallback window. Custom uploads cannot replay; they show "Live AI budget reached" so a disabled control always says why.

## Rollback

- **Worker or UI regression:** `npx wrangler deployments list` to find the last good version, then `npx wrangler rollback <version-id>`. Check the app loads twice in the same browser (cached assets), a featured run completes, and Agent Ops shows the new logs.
- **Prompt regression:** every insight records the prompt version that produced it. Set `PROMPT_VERSION` in `src/shared/prompts/extract.ts` back to the last promoted version and redeploy. Insights already routed keep their version, so the blast radius is queryable.
- **Routing rule mistake:** routing is a table, not a prompt. Revert the rule in Routing; the audit log has the before and after.

## Prompt promotion

1. Write the candidate prompt as a new version next to the current one.
2. Run `npm run eval` (both versions over every golden file). It writes `data/evals/latest.json`.
3. The gate passes only if overall precision ≥ 85% and recall ≥ 80%, level-5 recall ≥ 70%, grounding ≥ 95%, zero negative-control false positives, every injection flagged, zero PHI leakage, zero run failures, and no regression over 2 points on precision, recall or level-5 recall. Cost and p95 are reported, not gated (yet).
4. Only then change `PROMPT_VERSION` and deploy. Record the change and the eval run that allowed it in the Agent Ops changelog.

## Incident steps

1. **Acknowledge** the alert in Agent Ops so others know it is owned.
2. **Contain:** if output is wrong or unsafe, flip live AI off (runs replay) or roll back. Routing can be paused by disabling rules; nothing unreviewed routes while thresholds are raised.
3. **Diagnose** from the alert's trace: which step, which model call, which destination. Logs share the run's trace ID end to end.
4. **Fix and verify:** the affected run completes, deliveries have receipts, the SLO recovers, and the eval suite still passes if a prompt or model changed.
5. **Resolve** the alert and write two lines in the changelog: what happened and what changed. If a wrong insight reached a PM, tell the CSM and the PM directly, and add the case to the golden set.
