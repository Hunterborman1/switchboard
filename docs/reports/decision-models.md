# Decision model: which small model triages every input

Measured 2026-10-26 with `node --env-file=.env scripts/decision-speed-test.ts --runs 2` (and `--old-screen` for the comparison row) on the build key. Raw results: `.wrangler/decision-speed-test.json`.

**Chosen: `z-ai/glm-5.3-flash`** (`MODEL_DECISION` in `wrangler.jsonc` and `scripts/lib/llm.ts`). It triages every input and gives the second opinion at the gate. A decision call that fails or takes longer than 4 seconds falls back to the main model.

## What was measured

- **The real call path.** The v5 triage prompt and schema (`src/shared/prompts/screen.ts`) went through the production AI client (`src/worker/ai.ts`, decision tier). That means routing sorted by latency, `data_collection: deny`, `require_parameters: true`, and reasoning off. Where a family requires reasoning, it runs at the lowest effort with the reasoning text excluded. The fallback to the main model was blocked locally, so every number belongs to the candidate alone.
- **The real input.** Each golden file was parsed, redacted and wrapped exactly as a run sends it, about 1,400 to 3,600 input tokens.
- **Nine files, one per kind of input:** clean notes, messy speech-to-text, a chat export, an email thread, two prompt injections (notes and email), nothing actionable, PHI-heavy, and Spanish. Each ran twice, so 18 calls per model.
- **Time:** wall time of each call from the client: p50 and p95 over the 18 calls.
- **Valid:** a schema-valid answer on the first attempt.
- **Accuracy** against the golden labels (`expectActionable`, `expectInjectionFlag`), counting the model's own flag only. The pipeline also ORs in a deterministic injection check; that made no difference to which models qualified.
- **Rule:** the fastest model with every answer valid and every actionable and injection verdict right, ties broken on cost.

## Results

| Model | Valid | p50 ms | p95 ms | Actionable right | Injection right | $ per call | Notes |
|---|---|---|---|---|---|---|---|
| `deepseek/deepseek-v4.1-flash` (main model) | 18/18 | 484 | 1,765 | 18/18 | 18/18 | 0.000417 | Fastest, but it is the main model itself (see below) |
| **`z-ai/glm-5.3-flash`** | **18/18** | **882** | **1,465** | **18/18** | **18/18** | **0.000141** | **Chosen** |
| `google/gemini-3.1-flash-lite` | 18/18 | 1,041 | 1,233 | 16/18 | 18/18 | 0.000730 | Called the nothing-actionable check-in actionable |
| `inference-net/schematron-v2-turbo` | 18/18 | 1,191 | 1,979 | 5/18 | 14/18 | 0.000085 | Valid JSON, wrong verdicts |
| `anthropic/claude-haiku-5.5` | 18/18 | 1,324 | 2,394 | 18/18 | 18/18 | 0.000444 | Qualifies; slower |
| `openai/gpt-oss-120b` | 17/18 | 1,452 | 1,772 | 16/17 | 17/17 | 0.000372 | One invalid answer |
| `openai/gpt-oss-20b` | 18/18 | 1,580 | 2,654 | 18/18 | 18/18 | 0.000090 | Qualifies; slower |
| `openai/gpt-5.4-nano` | 18/18 | 1,603 | 2,521 | 18/18 | 18/18 | 0.000520 | Qualifies; slower, dearer |
| `nex-agi/nex-n2.5-mini` | 18/18 | 1,683 | 2,896 | 18/18 | 18/18 | 0.000053 | Qualifies; cheapest, slow tail |
| `upstage/solar-mini4` | 18/18 | 1,698 | 2,786 | 18/18 | 18/18 | 0.000134 | Qualifies; slower |
| `ibm-granite/granite-4.2-8b` | 2/18 | 1,767 | 2,424 | 2/2 | 2/2 | 0.000035 | Rate-limited upstream (HTTP 429) on 16 calls |
| `openai/gpt-6-luna` | 14/18 | 2,099 | 2,859 | 14/14 | 14/14 | 0.000194 | Four answers were not valid JSON |
| *Old screen: v4 prompt, main model, throughput routing* | 18/18 | 470 | 1,290 | 18/18 | 18/18 | 0.000616 | The path triage replaces |

All 12 candidates exist on OpenRouter and list structured outputs. Two needed client changes before they could be measured at all:

- GLM and gpt-oss reject "reasoning off", so they now get the lowest effort.
- Schematron has no reasoning parameter, so it gets none.

Both changes are in `reasoningFor` in `src/worker/ai.ts`.

### Second opinion (top two)

Each call batched the golden insights of one file, which it should agree with, plus two deliberately misread copies (wrong type, contradicting summary), which it should dispute.

| Model | File | ms | Agreed with correct items | Disputed misread items | $ |
|---|---|---|---|---|---|
| `z-ai/glm-5.3-flash` | `file_c1042` | 1,483 | 6/6 | 2/2 | 0.000104 |
| `z-ai/glm-5.3-flash` | `file_bluewater_pricing_eml` | 1,121 | 2/3 | 2/2 | 0.000081 |
| `z-ai/glm-5.3-flash` | `file_keystone_slack` | 964 | 3/3 | 2/2 | 0.000069 |
| `deepseek/deepseek-v4.1-flash` | `file_c1042` | 883 | 5/6 | 2/2 | 0.000480 |
| `deepseek/deepseek-v4.1-flash` | `file_bluewater_pricing_eml` | 823 | 3/3 | 2/2 | 0.000303 |
| `deepseek/deepseek-v4.1-flash` | `file_keystone_slack` | 683 | 3/3 | 2/2 | 0.000320 |

Both caught every misread item. Each missed agreeing with one correct item, which costs nothing: the policy only moves an item when the second opinion is confident (0.85 or higher to promote, 0.6 or higher to dispute).

## Why GLM-5.3 Flash, and not the faster main model

Taken literally, the rule picks the main model, `deepseek/deepseek-v4.1-flash`. It had the fastest p50 (484 ms), with every answer valid and every verdict right. We did not use it as the decision model, for three reasons:

1. **The second opinion would not be independent.** It would be the same model checking its own extraction. A model from a different family is a real check.
2. **The fallback would not be a fallback.** Decision calls fall back to the main model. If both are the same model, a model outage takes out triage and the second opinion together.
3. **Tail latency and cost.** GLM has the better p95 (1,465 vs 1,765 ms) at a third of the cost per call.

Among the other eleven candidates, GLM is the fastest that met every bar, so it is also what the rule picks once the main model is excluded. To use the main model for decisions anyway, set `MODEL_DECISION` to it. The client then serves decision calls on the primary chain (primary, schema retry, secondary), so nothing else changes.

## What this means for speed

- **The old screen was already fast** (p50 470 ms, last row). A separate decision model does not make triage faster than it was.
- **Triage still adds no time to a run.** It runs alongside extraction, which starts in parallel on the same redacted input and takes several seconds, so its sub-second latency stays hidden.
- **Triage is cheaper:** about a quarter of the old screen's cost per call. It also now returns what the input is, how noisy it is, and which analyses apply.
- **The second opinion adds no wall time.** It is one batched call per run (about 0.9 s), and the theme step's embeddings and nearest-neighbour lookups now start at the same moment instead of after it, because they don't depend on its verdict. Measured on a live C-1042 run: the theme step went from 1,187 ms to 2 ms, so the check costs nothing it didn't already wait for.
- **Long inputs** (over 24k characters) are extracted in parallel windows, so extraction takes about as long as the slowest window rather than one call over the whole document. This test did not measure that against a single call.

## Spend

This test cost **$0.1069** on the build key, against a $1.00 cap; the script logs cumulative spend and stops before its cap. The total covers 393 calls, including an initial one-run pass and a retry of the three models that first failed on client settings.
