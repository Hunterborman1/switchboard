# data: the fictional world and its results

Everything here is synthetic. The accounts, people and calls are made up, because real customer
conversations can't leave Invoca. The scripts in `scripts/data/` build it, and
[docs/data-review.md](../docs/data-review.md) explains how it was made and checked.

## What's here

| Path | What it is |
|---|---|
| `world/` | 14 accounts, 21 people, departments, 14 routing rules, the taxonomy and the theme seeds |
| `library.json` | One entry per sample file: 266 files, 48 of them featured in the picker |
| `files/` | The 266 sample files: transcripts, notes, email threads and chat exports |
| `golden/` | One golden label per file: the insights a correct run should find, with exact quotes |
| `tour-files.json` | The starting file for each of the walkthrough's six branches |
| `scenarios/cards.json` | The scenario cards the files were written from, for inspection |
| `backfill-themes.json` | The planned theme of each insight in each backfill file |
| `backfill/` | The seeded history: real pipeline runs of the 218 backfill files |
| `replays/` | A recorded real run of each featured file. Runs replay these when live AI is off |
| `evals/` | Eval results: `latest.json` and per-file details for prompts v4 and v5 |
| `platform/` | The Agent Ops registry seed (`agents.json`) and its simulated users (`people.json`) |
| `READY` | A marker with the dataset's counts |

## How it's used

- `scripts/seed.ts` loads it into D1 and Vectorize. `scripts/platform/seed.ts` loads
  `platform/`.
- Scripts read it through `scripts/lib/data.ts`. Without `READY` they fall back to
  `tests/fixtures/`.
- In fixture mode (`VITE_FIXTURES=1`), the browser reads `world/`, `library.json`, `golden/` and
  `files/` directly.
- The walkthrough's platform scene reads `world/people.json`.

## Change it safely

- Don't edit generated files by hand. Change the generator in `scripts/data/` and rebuild, so a
  rebuild reproduces the change.
- Every golden quote must appear exactly in its file. `scripts/data/check.ts` enforces this and
  the other data rules.
- After changing data, reseed locally (`npm run db:seed:local`). Re-record replays or rerun evals
  only if their inputs changed. Both spend on the build key.
- Tests: `npx vitest run --project unit tests/unit/data`, then `npm test`.
