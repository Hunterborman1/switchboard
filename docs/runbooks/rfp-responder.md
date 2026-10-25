# RFP & Security Questionnaire Responder: runbook (simulated)

A short, simulated runbook for the simulated RFP agent in the Agent Ops registry. It shows what a second team's runbook looks like when it follows the same agent standard; none of it describes a real Invoca system.

## Owners

- **Agent owner (on call):** Malik Johnson, AI Operations. Owns alerts, flow changes and this runbook.
- **Business owner:** Chris Donovan, RVP Enterprise Sales. Signs the success metric (questionnaire to first full draft in under one business day).
- **Reviewers:** the proposal manager reviews every draft; Security & GRC review every security answer before anything is sent.

## Library sync

The agent drafts only from the approved answer library in Google Drive. The alert "Answer library sync older than 7 days" means drafts may cite superseded answers.

1. Open the Gumloop flow and check the Drive connector. An expired token is the usual cause.
2. Re-authorise the connector with the service account, then run the sync step on its own.
3. Confirm the library's last-modified date in the flow log matches Drive.
4. Tell the proposal team which drafts were produced while the sync was stale, so they re-check cited answers.
5. Acknowledge the alert when the sync is running; it resolves when the last sync is under 7 days old.

## Draft quality drops

- Spot-check five recent drafts against their cited sources. A missing or wrong citation is a stop-ship: drafts without a source are not sent.
- There is no regression set yet (the eval item on the agent page is open), so any flow edit is checked by hand on three past questionnaires before it ships.

## Rollback

- Flow versions are exported nightly. To roll back, import the previous export (currently flow v11) and re-run the library sync.
- Note the rollback in the agent's change log with the reason and the trace of the run that prompted it.

## Spend cap

- The Gumloop workspace has a $150/month cap and a $2.50 per-run cap. A run that hits the per-run cap stops and is flagged for a person.
- If the monthly cap is near, raise it with the business owner at the weekly review rather than mid-week.
