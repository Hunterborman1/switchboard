---
name: add-connector
description: Make a simulated Switchboard connector real (send to the actual Slack, Jira, Salesforce, Gmail, Google Drive…) or add a new tool to the catalog. Use when asked to connect a real system, add an integration, change what a delivery contains, or tag people in a new tool.
---

# Add or make real a connector

Today every connector is **simulated**: connecting records a workspace row, the pipeline builds the
delivery (payload, mentions, receipt) and nothing leaves the Worker. Keep that shape; a real
connector adds one outbound call after the delivery is built.

## The pieces

| Concern | Where |
|---|---|
| Catalog: name, category, direction, scopes, config fields, identity key | `CONNECTORS` in `src/shared/platform.ts` |
| Which channel uses which connector | `CHANNEL_CONNECTOR`, `CHANNEL_LABEL` in `src/shared/platform.ts`; the `Channel` enum in `src/shared/contracts.ts` |
| Workspace state (connect, configure, test, disconnect, activity) | `src/worker/connections.ts`, routes in `src/worker/api/switchboard.ts` |
| Routing falls back to triage when disconnected | `channelAvailable` / `routeInsight` in `src/pipeline/route.ts` |
| Delivery payload, mentions, receipt | `renderPayload`, `deliveryMentions`, `deliverInsight` in `src/pipeline/deliver.ts` |
| Preview in the UI | `src/app/components/destinations/Previews.tsx` (one preview per category) |
| Mark | `ConnectorMark` in `src/ds/marks.tsx` |

## Add a new tool to the catalog (still simulated)

1. Add the id to `CONNECTOR_IDS` and an entry to `CONNECTORS` (direction, category, honest scopes,
   config fields, `identity` = the person field used to tag someone, or null for sources).
2. If it receives results: add a `Channel`, map it in `CHANNEL_CONNECTOR` and `CHANNEL_LABEL`, add a
   payload case and a receipt format in `deliver.ts`, and render it in `Previews.tsx` (reuse the
   category's preview). Add the person identity key to `PersonIdentities` if it's a new handle type.
3. Add a glyph to `ConnectorMark` (a simple shape in the tool's colour, never its logo).
4. Tests: `tests/unit/pipeline/connectors.test.ts`, `theme-deliver.test.ts`, and the routing preview.

## Make one real

1. **Credentials.** Create the app in the vendor (Slack bot token, Jira OAuth 2.0 3LO or an API
   token, a Salesforce connected app, a Google service account). Store secrets with
   `npx wrangler secret put <NAME>`, never in D1 or the repo. For per-customer OAuth, store tokens
   encrypted per workspace and refresh them server-side.
2. **Adapter.** Add `src/worker/outbound/<id>.ts` with one function: take a `Delivery` and the
   connection, call the vendor API, return `{ ok, receipt, ms, note }`. Map the payload fields the
   preview already shows (title, quote, account, ARR, link back, mentions as vendor user ids).
3. **Wire it after the delivery is built**, not inside the pure pipeline: in the Worker's deliver
   hook (where deliveries are saved), call the adapter when the connection is live and a flag such as
   `CONNECTOR_<ID>_LIVE=true` is set. Write the real receipt and each attempt onto the delivery;
   retry 429/5xx with backoff; never retry a 4xx. Emit a `delivery.<id>` span (see
   `src/worker/telemetry.ts`).
4. **Status changes back** (Jira/Linear "Shipped" → notify the CSM): add a webhook route that verifies
   the vendor signature and calls the same code path as `POST /api/deliveries/:id/ticket`.
5. **Labels.** Drop the "Simulated" badge for that connector only when it's live in that
   deployment; the Connections page and the walkthrough must say which tools are real.
6. **Tests.** Mock the vendor HTTP in a Worker test (`tests/worker/harness.ts` shows the pattern for
   OpenRouter); cover success, retry, 4xx and a disconnected connection routing to triage.

## Check

`npm run typecheck`, `npm test`, `npx playwright test --project=app tests/e2e/app/destinations.spec.ts
tests/e2e/app/platform.spec.ts`, and a screenshot of Connections and Deliveries.
