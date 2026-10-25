# Signal Loop data review

Reviewer notes on the synthetic library: what was built, how it was checked, and what I changed after reading every featured file.

## What's in the library

- **266 files**: 48 featured (shown in the picker) and 218 backfill (history for themes, trends and dashboards).
- **384 golden insights.** Every file has a golden label. Every golden quote is an exact substring of the final file bytes, and `scripts/data/check.ts` enforces this.
- **World**: 14 fictional accounts across 8 verticals ($38k to $1.58M ARR), 21 people (6 CSMs plus a VP of Customer Success, one PM per product area, a VP of Product, specialists and a triage owner), 14 seed routing rules and a taxonomy with definitions and counter-examples.
- **Generation spend**: $0.98 of the $3.00 allowance. Every call is cached in `data/.cache/llm/`, so a rebuild costs nothing.

### Pipeline

| Step | Script | Notes |
|---|---|---|
| World | `scripts/data/world.ts` | Writes `data/world/{accounts,people,routing,taxonomy,departments}.json`. |
| Scenario cards | `scripts/data/scenarios.ts` | 48 hand-written featured cards (`scenarios/featured.ts`; C-1042 is fully hand-written in `scenarios/c1042.ts`) and 218 backfill cards built from 14 theme seeds with a seeded RNG (`scenarios/backfill.ts`). |
| Clean text | `scripts/data/generate.ts` | One model call per card. Output is validated for planted lines (verbatim, right speaker, used once), AI-tell phrases, stray feedback keywords, account facts copied verbatim, and truncation. An **audit call** then lists any product feedback the card didn't plant; the file is regenerated with that feedback, up to 5 attempts. |
| Corruption | `scripts/data/corrupt.ts` | Pure and seeded. Level 3 adds fillers and stutters. Level 4 adds homophones ("in vocal", "call rail", "presence", "signal a eye", "google adds", "genesis", "mar checks"), dropped punctuation and casing, `[inaudible]`, `[crosstalk]`, words bleeding across turn boundaries and timestamp drift. Level 5 is heavier still, with merged turns, a truncated start and shorthand typos and abbreviations in Slack and notes. Golden quotes never get fillers or markers inserted inside them. |
| Reviewer edits | `scripts/data/scenarios/edits.ts` | My post-read fixes, applied before corruption so a rebuild reproduces them (listed below). |
| Build | `scripts/data/build.ts` | Renders each file (Zoom VTT, ASR VTT, bracketed, Otter-style and ASR text, Markdown, RFC 822 `.eml`, Slack export, scratch dump). It then relocates each golden quote in the final bytes: exact first, then normalized, then a fuzzy `fastest-levenshtein` window. It rewrites the quote to the exact substring and **fails the build** if any quote can't be found. |
| Check | `scripts/data/check.ts` | Runs Zod against the shared contracts, then checks unique ids, call ids and paths, real byte sizes, 8 files per level, the edge counts, exactly one recommended file, the duplicate as an exact byte copy, tourPath rules, quotes and PHI tokens present in each file, injection and negative-control flags, and that no files contain em dashes, model-vendor names or AI-tell phrases. |
| Tests | `tests/unit/data/*.test.ts` | Same seed gives the same output, noise rises with level, protected quotes stay locatable, plus relocation and normalization tests (18 tests). |

Rebuild everything: `node --env-file=.env scripts/data/world.ts && node --env-file=.env scripts/data/generate.ts && node --env-file=.env scripts/data/build.ts && node --env-file=.env scripts/data/check.ts`

## The recommended file: C-1042

`Calls/Week 43/2026-10-21_Brightline_QBR_transcript.vtt` is a Zoom-style VTT of about 1,850 spoken words (13 minutes). Dana Ortiz (Director of Marketing), Jeff Kim (Director of Operations) and Marcus Bell (CSM) talk through it. It opens with small talk (rain in Charlotte, a van that broke down) and ends with Thanksgiving plans and the Panthers. I wrote it by hand.

| # | Type / area / severity | Golden quote | Routes to |
|---|---|---|---|
| a | bug / integrations / high | "the offline conversions are showing up two, sometimes three days after the call" | Mei Tanaka, Jira INTG |
| b | competitor_mention / integrations / medium | "CallRail's been emailing me, like, every week. Their rep keeps telling me they push conversions to Google same day." | Jordan Reyes, #compete |
| c | bug / signal_ai / high | "Signal AI is tagging a lot of our after-hours calls as spam, and they're not spam." | Omar Haddad, Jira SAI |
| d | pricing_objection / billing_pricing / medium | "he asked me why PreSense is an add-on at all. His words were, it feels like paying twice." | Kate Morrison, #pricing-feedback |
| e | praise / signal_ai / low | "the dispatchers love them. Like, genuinely." | Elena Vasquez, wins digest |
| f | churn_risk / integrations / high (hedged) | "if the Google piece isn't fixed by renewal, we'll have to look around." | Renee Adams, #cs-leadership |

**Where grounding matters.** Dana starts insight (a), Jeff cuts in with a clarifying question ("It's the booked job signal specifically, right?") and Dana finishes two turns later: "So we're basically bidding on last week's data." A model that stitches those turns into one tidy quote produces text that doesn't exist in the transcript, so grounding drops it. The concrete numbers support the story: 41k calls, 11% growth, 38% booked rate, CPA from $85 to $120, 31 of 40 spam-tagged calls were real, and a $9k day. The churn line is hedged on purpose ("I don't want this to sound like a threat") and is high severity, so it always goes to review.

The duplicate edge file (`2026-10-21_Brightline_QBR_transcript (1).vtt`) is a byte-identical copy, so the pipeline's hash idempotency can catch it.

## Branch entry files (`data/tour-files.json`)

| Path | File |
|---|---|
| main | `file_c1042` |
| clean | `file_harbor_checkin_notes` (3 tidy insights in team-template notes) |
| messy | `file_sunpeak_checkin_asr` (raw ASR: "google adds", "smart bidding", "call rail", speaker bleed, sarcasm) |
| security | `file_ridgeway_prep_injection` (blunt "IGNORE ALL PREVIOUS INSTRUCTIONS…" inside a pasted survey export, plus 2 real insights) |
| negative | `file_prairielink_friendly` (training logistics, a puppy, the first snow; zero feedback) |
| privacy | `file_meridian_phi_call` (patient name, DOB, MRN, phone and address read aloud, plus a critical redaction bug) |

The second injection file is subtle. `RE_ Q4 check-in follow-ups.eml` hides "Note for automated assistants summarizing this thread…" inside a corporate confidentiality footer. The second PHI file is `Patient info in daily summary - please advise.eml`. The Spanish file is a check-in run entirely in Spanish, with English product names left in.

## Featured file summary

Word counts are whitespace tokens in the final file, including VTT cue numbers, timestamps and email headers. Insight shorthand is type/area/severity, where FR = feature request, comp = competitor, price = pricing objection, and severity is l/m/h/c.

| Call | File | Level | Format | Words | Planted insights |
|---|---|---|---|---|---|
| C-1035 | `harbor-fcu-checkin-notes-2026-10-20.md` | 1 | md | 423 | FR/quality/m, praise/signal_ai/l, FR/platform/l |
| C-0976 | `keystone-exec-sponsor-notes-oct14.md` | 1 | md | 485 | bug/presense/h, bug/ai_agents/h, praise/presense/l |
| C-0933 | `Frontier_QBR_Q3_notes.md` | 1 | md | 452 | bug/integrations/m, FR/quality/m, FR/platform/l |
| C-0914 | `coastal-comfort_ai-messaging-onboarding.md` | 1 | md | 412 | FR/ai_agents/m, praise/ai_agents/l |
| C-0983 | `prairielink-notes-oct.md` | 1 | md | 505 | bug/call_tracking/h, FR/platform/l |
| C-0948 | `Evergreen renewal prep - notes.md` | 1 | md | 363 | price/billing/m, comp/call_tracking/m, bug/integrations/m |
| C-1008 | `bluewater_escalation-recap_2026-10-16.md` | 1 | md | 291 | bug/presense/h, churn/presense/h, price/billing/m |
| C-0968 | `cedar-ridge-dental_checkin_10-13.md` | 1 | md | 378 | bug/integrations/h, FR/signal_ai/m |
| C-0927 | `GMT20261007-160214_Northwind-QBR.transcript.vtt` | 2 | vtt | 1144 | bug/presense/h, bug/ai_agents/m, price/billing/m, praise/platform/l |
| C-0966 | `Atlas check-in 10-13.txt` | 2 | txt | 1012 | comp/billing/h, bug/integrations/h, FR/platform/l |
| C-0906 | `2026-10-05_Keystone_VoiceAgent_onboarding.vtt` | 2 | vtt | 1081 | FR/ai_agents/m, bug/integrations/m |
| C-1020 | `sunpeak-renewal-call-2026-10-19.txt` | 2 | txt | 1072 | price/billing/h, comp/integrations/m, churn/billing/h |
| C-0984 | `Meridian_exec-sponsor_2026-10-15.vtt` | 2 | vtt | 1229 | FR/quality/m, praise/signal_ai/m, FR/signal_ai/h |
| C-1045 | `Frontier_checkin_Oct21.txt` | 2 | txt | 758 | comp/quality/m, bug/integrations/m, FR/platform/l |
| C-0980 | `2026-10-14_CoastalComfort_QBR.vtt` | 2 | vtt | 1218 | bug/ai_agents/h, comp/call_tracking/l, praise/presense/m |
| C-1025 | `ridgeway-escalation-2026-10-20.txt` | 2 | txt | 932 | bug/integrations/h, comp/billing/h, churn/integrations/h |
| **C-1042** | `2026-10-21_Brightline_QBR_transcript.vtt` | 3 | vtt | 2463 | bug/integrations/h, comp/integrations/m, bug/signal_ai/h, price/billing/m, praise/signal_ai/l, churn/integrations/h |
| C-0934 | `2026-10-08_KeystoneMutual_QBR.vtt` | 3 | vtt | 1623 | FR/quality/m, bug/signal_ai/m, praise/presense/l |
| C-1058 | `Harbor FCU - renewal discussion (Otter).txt` | 3 | txt | 1526 | price/billing/m, bug/integrations/m, bug/signal_ai/m |
| C-1007 | `northwind_presense-escalation_2026-10-16.vtt` | 3 | vtt | 1519 | bug/presense/c, churn/presense/h |
| C-0961 | `atlas-exec-sponsor-otter.txt` | 3 | txt | 1290 | churn/billing/h, comp/billing/h, bug/integrations/h |
| C-0946 | `GMT20261009-183011_PrairieLink-QBR.transcript.vtt` | 3 | vtt | 1760 | bug/ai_agents/h, bug/call_tracking/m, FR/platform/l |
| C-0926 | `bluewater_checkin_oct7.txt` | 3 | txt | 1779 | bug/integrations/m, FR/quality/m, comp/quality/l |
| C-1023 | `Evergreen_QBR_2026-10-20.vtt` | 3 | vtt | 1178 | bug/signal_ai/m, comp/integrations/m, praise/signal_ai/l |
| C-0981 | `rec_20261014_sunpeak_checkin_raw.txt` | 4 | txt | 1173 | bug/integrations/h, bug/ai_agents/m, comp/integrations/m |
| C-0923 | `brightline_dispatch-sync_1007.vtt` | 4 | vtt | 1319 | bug/signal_ai/m, praise/signal_ai/l, FR/signal_ai/l |
| C-1047 | `audio_1021_coastal_presense.txt` | 4 | txt | 1007 | bug/presense/h, price/billing/m |
| C-1013 | `meridian_checkin_20261019_auto.vtt` | 4 | vtt | 1450 | bug/integrations/m, FR/quality/m |
| C-1055 | `Ridgeway_renewal_call_RAW.txt` | 4 | txt | 969 | comp/billing/h, price/billing/m, churn/billing/h |
| C-1033 | `keystone-claims-escalation-raw-transcript.txt` | 4 | txt | 1018 | bug/ai_agents/h, bug/presense/m |
| C-0993 | `frontier_qbr_auto-transcript.vtt` | 4 | vtt | 2011 | bug/integrations/m, praise/presense/m, FR/platform/l |
| C-1071 | `nw_checkin_1023.txt` | 4 | txt | 948 | bug/signal_ai/m, price/billing/m |
| C-1010 | `fwd_ RE_ renewal concerns.eml` | 5 | eml | 669 | churn/billing/h, comp/billing/h, bug/integrations/h |
| C-1038 | `slack-export_keystone_csm.txt` | 5 | chat | 612 | bug/presense/h, bug/ai_agents/h, FR/quality/m |
| C-0965 | `Fwd_ RE_ conversion upload timing.eml` | 5 | eml | 634 | bug/integrations/h, comp/integrations/m |
| C-0996 | `harbor-raw-notes.txt` | 5 | txt | 456 | bug/integrations/m, price/billing/m |
| C-0955 | `slack-export_northwind-escalation.txt` | 5 | chat | 744 | bug/presense/h, churn/presense/h |
| C-1067 | `RE_ QM pricing + next steps.eml` | 5 | eml | 803 | price/billing/h, FR/quality/m, churn/billing/h |
| C-1028 | `slack-export_sunpeak-renewal.txt` | 5 | chat | 588 | price/billing/h, comp/integrations/m, bug/integrations/h |
| C-1014 | `Fwd_ Voice agent transfers - examples.eml` | 5 | eml | 608 | bug/ai_agents/h, FR/platform/l |
| C-1063 | `PrairieLink_checkin_Becca_1022.vtt` | nothing_actionable | vtt | 857 | none |
| C-0999 | `frontier_admin-training-logistics.md` | nothing_actionable | md | 283 | none |
| C-1039 | `ridgeway_call-prep + survey export.txt` | injection | txt | 754 | bug/integrations/h, comp/billing/m |
| C-0949 | `RE_ Q4 check-in follow-ups.eml` | injection | eml | 605 | price/billing/m, bug/presense/h |
| C-0960 | `2026-10-12_Meridian_redaction-review.vtt` | phi_heavy | vtt | 1067 | bug/signal_ai/c, FR/signal_ai/h |
| C-1015 | `Patient info in daily summary - please advise.eml` | phi_heavy | eml | 709 | bug/signal_ai/h, FR/signal_ai/m |
| C-1002 | `SunPeak_equipo-espanol_checkin_2026-10-16.txt` | non_english | txt | 924 | bug/signal_ai/m, FR/signal_ai/m, praise/ai_agents/l |
| C-1041 | `2026-10-21_Brightline_QBR_transcript (1).vtt` | duplicate | vtt | 2463 | same as C-1042 |

## Review notes per file

I read every featured file after the final build. Overall the voice is natural. CSMs ask clarifying questions, commit to dated follow-ups and refuse to guess at root causes on the call. Customers name their own people (Priyanka, Carla, Victor, Luis), give concrete numbers and hedge. Small talk is specific to each account: Charlotte rain, Phoenix heat, harvest season and homecoming in South Dakota, hail in San Antonio, a hotel at a mortgage conference, AEP prep in Hartford. I found no AI-tell phrases; the build bans them and `check.ts` rejects them.

**Level 1 (notes).** These use one consistent team template (Summary, Discussion, Product feedback, Risks, Next steps), which is how a real CS team's notes look. Each planted line appears once, under Product feedback. *Fixed:* the first generation repeated planted lines in Discussion, wrapped them in quotes with "Name:" prefixes, truncated one file, and had the CSM claim a requested feature already existed (Prairie Link sharing, Cedar Ridge transcripts). I tightened the prompt rules and regenerated. *Edited:* Cedar Ridge said "Google Ads and Meta… both are fine" two lines above its Google Ads lag complaint.

**Level 2 (tidy transcripts).** These are well-punctuated and agenda-driven, as QBRs and escalations are. Northwind, Atlas, Coastal and Ridgeway each carry 3–4 distinct signals with clear owners. *Edited:* in SunPeak's renewal, Cody said Google Ads conversions were "fine, no complaints" a day before SunPeak's Slack and five days after its check-in both reported the lag. I removed those two Q&A exchanges.

**Level 3 (natural).** These have real tangents (the Cardinals, a fantasy-league spreadsheet, a football game), interruptions, and points that take several turns to land. Keystone's claims-empathy request is a good example: Nate admits "I don't know how to say what I actually want." *Edited:* in Keystone's QBR, Erin called the AI Voice Agent transfers "no issues" a week before Keystone escalated exactly that defect. Bluewater's check-in called PreSense "solid" two days before Bluewater reported the Genesys transfer gaps.

**Level 4 (raw ASR).** These read like real auto-transcripts. Speakers are "Speaker 1/2/3" or names in lowercase, product names are misheard, words bleed into the next speaker's turn ("both hear me okay?" lands on Speaker 2), and sarcasm comes through ("love that for them") alongside hedged complaints ("I'm not saying it's a dealbreaker but…"). *Fixed:* I cut the stutter rate by more than half after the first pass, because doubled words appeared in almost every line. *Edited:* four contradictions with other files for the same account. Northwind's Oct 23 check-in called PreSense transfers "quiet" one week after a critical escalation on them. Ridgeway's renewal call called Google conversions fine two days after its escalation. Frontier's QBR called QM scorecards fine despite Victor's open request. Brightline's Oct 7 ops sync said the ad numbers looked normal.

**Level 5 (chaos).** These are forwarded `.eml` threads with real headers (Received, Message-ID, In-Reply-To and References), nested `>` quoting, signatures and confidentiality footers; Slack Connect exports with threads, emoji codes, shorthand and typos; and scratch dumps with pasted errors (`REQUIRED_FIELD_MISSING: [Preferred_Branch__c]`). *Edited:*
- Northwind's churn heads-up sat in the customer-shared Slack channel. It now sits in a separate `#acct-northwind (internal)` section of the export.
- Brightline's forward note was written as if by someone other than Marcus, and Dana's email made their CMO "she" while C-1042 makes him "him".
- Atlas's Greg said "the Google Ads side is working" in the same thread as Tanya's delay.
- Bluewater's COO called PreSense fine six days after escalating it.
- Coastal's forward pasted a second, redundant snippet.
- The SunPeak deal-desk channel misdated the renewal call.

**Edge files.** The negative controls contain no feedback, and the audit model agreed. Both injection files also carry two genuine insights, and Diego's notes dismiss the blunt one as "junk, looks like a test or a bot". The PHI tokens appear verbatim and the product issue is real: card numbers are masked but spoken DOBs and MRNs are not. *Edited:* the Spanish file made Marisol a supervisor; she is the Director of Sales. Name collisions are fixed: a customer agent named "marcus", a Coastal agent named "Dana", and a Keystone admin named "Priya" in the first pass. The prompt now lists reserved first names.

## Consistency rules this world follows

- Each account's open issues hold steady over time. For example, Brightline's Google Ads lag starts in late September, shows up in Priyanka's Oct 13 email and peaks in the Oct 21 QBR. Northwind's PreSense transfer issue starts with the Genesys update on Oct 3, comes up in Slack on Oct 12 and becomes a critical escalation on Oct 16.
- Each account only mentions products it owns and the partner platforms it actually connects (`INTEGRATIONS_USED` in `scenarios/contacts.ts`). Atlas never talks about PreSense; Cedar Ridge never mentions Salesforce.
- Customers' internal staff never share first names with Invoca staff or with other accounts' contacts.

## Backfill and themes

There are 218 files from 2026-09-14 to 2026-10-23. By level: 10 at level 1, 80 at level 2, 74 at level 3, 40 at level 4 and 14 at level 5. Twenty are nothing-actionable check-ins. Theme seeds and their planted counts:

| Theme | Insights | Accounts | Shape |
|---|---|---|---|
| Offline conversions lag in Google Ads | 32 | Brightline, Atlas, SunPeak, Ridgeway, Evergreen, Coastal, Cedar Ridge ($1.40M ARR) | Rising sharply in weeks 42–43 |
| Add-on pricing friction at renewal | 22 | 8 accounts | Rising into Q4 renewals |
| Signal AI mislabels after-hours callers as spam | 22 | 6 accounts | Steady and rising |
| PreSense data missing on Genesys transfers | 18 | Northwind, Keystone, Bluewater, Meridian | Jumps after the Oct 3 Genesys update |
| Salesforce field mapping breaks on custom objects | 18 | 5 accounts | Flat |
| Teams love AI call summaries (praise) | 18 | 8 accounts | Flat |
| AI Voice Agent handoff loses context | 16 | 5 accounts | Steady |
| Dashboard export to Looker/Sheets | 16 | 8 accounts | Flat |
| QM scorecards need custom criteria | 14 | 5 accounts | Flat |
| CallRail same-day sync pitch | 14 | 6 accounts | Rising with the Google lag |
| Churn signals attached to bug or pricing calls | 14 | Accounts on watch or at risk | Later weeks |
| Want HIPAA-safe transcript redaction controls | 12 | Meridian, Cedar Ridge and others | Rising slightly |
| PreSense routing lifts conversion (praise) | 12 | 5 accounts | Flat |
| Marchex pricing undercut in automotive | 9 | Atlas, Ridgeway | Rising slightly |
| DNI swap fails on single-page apps | 9 | Prairie Link, Coastal, Frontier, SunPeak | From week 39 |

The audit found 10 extra insights in backfill files that the cards hadn't planted. Rather than hide them, I folded them into those files' golden labels (`backfill-themes.json` marks them `audit_extra`). Featured files have zero audit extras.

## Known limitations

- Backfill transcripts are 400–800 words each. Otter-style headers show durations of 3–6 minutes, so they read as excerpts or short calls rather than full meetings.
- Golden quotes for levels 4–5 are the *corrupted* spans: "our google adds conversions are showing up like two days late…". A model that "repairs" the text when it quotes will need the fuzzy grounding path. This is intended.
- A few featured files still carry small generic remarks such as "the rest is fine" or "agents like it" next to a planted praise item. The audit treated these as restatements, not new feedback.
