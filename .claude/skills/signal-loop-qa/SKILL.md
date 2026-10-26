---
name: signal-loop-qa
description: Answer Invoca panel questions about Signal Loop and Agent Ops with grounded, cited numbers and honest gaps. Use when Hunter asks how to answer a question about the build (cost, accuracy, evals, grounding, PHI, injection, build vs buy, adoption, ROI, rollout, production stack, the agent standard), wants a mock Q&A, or needs a claim checked against the repo.
---

# Answer panel questions about Signal Loop

## Sources, in order of authority

1. Data and code: `data/evals/latest.json`, `data/evals/details-v4.json`, `data/evals/details-v5.json`, `data/replays/*.json`, `data/backfill/runs.json`, `data/platform/agents.json`, `src/shared/scoring.ts`, `src/pipeline/score.ts`, `wrangler.jsonc`.
2. `docs/WALKTHROUGH.md`: every number already has a source tag; the ADRs hold the justifications; "Honest gaps and next steps" holds the caveats.
3. `docs/speaker-notes.md` → Likely questions, and the Q&A sections of the write-up (`/write-up#<topic>`, prose in `src/shared/writeup/content.ts`), for phrasing.

If two sources disagree, the data file wins; say which file you used.

## Rules for every answer

- **Cite.** Put the file next to the number: "88.7% precision (125/141, `data/evals/latest.json`)". Show the denominator for every percentage.
- **Label.** Say "assumption", "simulated" or "live" whenever it applies. All accounts, people and calls are fictional.
- **Model naming.** Say "main model" and "backup model". Never name a model vendor or a router service; exact ids live only on `/app/settings`.
- **No secrets.** Never include the password, signed links, the owner link or anything from `.env`.
- **Shape.** Lead with the direct answer in one sentence, then one piece of evidence, then the trade-off or gap. Under 80 words unless asked for more.
- **Don't round up.** If a number is small (two PHI files, two injection files), say so before the panel does.

## Phrasing honest gaps

Use the pattern: what is true → what it does not prove → what I would do first.

> "Grounding proves the words were said, not that they are feedback. v5 had 99.4% of quotes grounded and still fell to 59.7% precision. That's why there's a precision gate and a person on high-stakes items."

Avoid "fully", "guaranteed", "production-ready", "zero retention". Say "a routing filter, not a contract" for the provider data setting.

## The hardest questions

1. **"Why believe 18 minutes per call?"** You shouldn't yet. It is one registered assumption (`data/platform/agents.json` → `baselineMinutesPerUnit`, `src/shared/scoring.ts` → `MINUTES_SAVED_PER_CALL`), labelled on the exec view; review minutes are measured. The 2-week time study replaces it. Note the rollout scene uses a different assumption (10 minutes × 70%); both get replaced.
2. **"Haven't you moved data entry into a review queue?"** Partly, by design. 76 of 141 v4 insights went to review (54%, `details-v4.json`) because churn, high or critical bugs and low confidence always do. A review is approve-or-edit on a quoted item. Thresholds get tuned on champion labels.
3. **"How often is it wrong without a human seeing it?"** On the eval, 5 of 65 auto-routed insights were false positives (7.7%, `details-v4.json`); routing accuracy 94.4% (118/125, `latest.json`). In shadow mode nothing routes.
4. **"Four types are under 85% precision. Why trust it?"** Feature request 81.5%, praise 81.3%, churn 78.6%, pricing 77.8% (`latest.json`). Churn is always reviewed; per-type thresholds are next.
5. **"Isn't recall circular? You wrote and labelled the data."** Partly, yes. Checks exist (golden quotes verified in the final bytes, an audit model for unplanted feedback, `docs/data-review.md`), but week 1 is labelling 50–100 real calls, and I'd publish the drop.
6. **"Did you tune on the test set?"** Yes; there is no held-out split, so v4 is optimistic. 48 files catch big regressions like v5, not small differences.
7. **"Grounding caught nothing on v4. What's it for?"** 275/275 grounded (`latest.json`). It is a seatbelt; v5 shows the limit.
8. **"Did you build v5 to fail?"** Yes, the cost-cutting rewrite people make. 211 insights instead of 141; 38 extra praise, 20 extra churn; $0.113 vs $0.093 and p95 6.3 s vs 3.8 s on the eval set (`latest.json`). Caveat: v4 ran with 0 judge calls, v5 with 2 (`details-*.json`); re-run both under identical settings.
9. **"What does it cost per call?"** Recorded runs average $0.00141 (48 runs, `data/replays/*.json`); backfill $0.00133 (218 runs). Worst-case reservation $0.02 (`scoring.ts` → `RUN_COST_ESTIMATE_USD`). Model spend is small next to review time and hosting. Read the live figure from `/write-up#cost` if asked during the session.
10. **"PHI leakage 0 of 2 is two files."** Correct. Redaction runs before any model call with reversible tokens; recall on unanchored patient names is unproven. A labelled PHI set and redaction recall as a release gate come first.
11. **"Where does the data go?"** Raw files stay in our storage; only redacted text reaches a model; providers that collect or train on data are excluded by a routing setting, not a contract. DPA and zero-retention terms are production items.
12. **"Prompt injection?"** Text is wrapped as data, output is schema-only, the model has no tools; triage (the decision model, OR-ed with a code check) flags it (2 of 2) and the whole file goes to review (`data/replays/file_ridgeway_prep_injection.json`). Two files is too few.
13. **"Why build, not buy?"** Gong, Productboard and Enterpret each cover part; none owns Invoca's taxonomy, routing rules and the loop back to CSMs (`/backup/build-vs-buy`). Long-term home: Signal AI.
14. **"Nine of nine on your own standard is self-certified."** Yes. The security review and business-owner sign-off are illustrative (`agents.json` → standard). In the role, someone other than the builder attests.
15. **"Cloudflare now, Neon and Vercel later: isn't that a rewrite?"** A port of adapters. `src/pipeline/run.ts` is runtime-agnostic, contracts are shared Zod, and the eval suite proves parity. The production stack is a design, not yet a port.
16. **"What if the main model degrades?"** Retry once, then the backup model, then the dead-letter queue (`docs/RUNBOOK.md` → Model fallback). Gap: the backup model has never been scored as primary.
17. **"How do you avoid becoming the bottleneck across 50 agents?"** Build the rails, not the agents: registry, the nine-check standard as a template, a shared eval harness, one SDK for logs and usage, office hours. Today the second agent is simulated.

## Checking a claim

To verify a number before answering, read the field named in the source tag. For eval metrics: `node -e "const j=require('./data/evals/latest.json'); console.log(j.promoted.metrics.find(m=>m.key==='precision'))"`. Report the file and field you read.
