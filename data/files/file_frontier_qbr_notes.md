# Frontier Home Lending · Q3 QBR · October 8, 2026

**Attendees:** Monica Chen (SVP, Consumer Direct Lending), Stacy Klein (Salesforce Platform Owner), Andre Williams (Director, Contact Center Operations), Aisha Coleman (CSM, Invoca)

## Summary
Reviewed Q3 call volume and Five9 talk time after September's rate-driven refinance surge, and confirmed what carried over into Q4 planning. Salesforce routing and compliance asks were the main open threads; both go back with Invoca for follow-up. Reporting and the QM roadmap got a first pass with more detail to come.

## Discussion
- September refinance surge pushed call volume to 41,000 calls, up about 60% over August. Andre said Five9 average handle time landed at 8:40, roughly 50 seconds above plan, mostly on the refi queue.
- Monica said the surge looks seasonal, not structural, and wants the Q4 number set at a flat 28,000 per month rather than the earlier 34,000 forecast.
- Andre's team is adding 15 loan officers in October and wants PreSense screen-pop timing checked after the ramp, since new hires are slower on the first screen.
- Stacy walked through the Loan Application object mapping during the call and asked for a follow-up with Invoca's integration team.
- Monica relayed a compliance ask from Victor's group, who could not join. It goes to Invoca's product team for a read.
- Renewal is April 30, 2027; no action needed today.
- Adobe Analytics and Google Ads conversions both came up as running as expected.

## Product feedback
- Stacy reported that Invoca call records stop writing to the Loan Application custom object whenever a new picklist value is added; the standard Lead mapping is fine.
- Victor's team wants QM scorecards that change by loan type, so a VA refinance call isn't graded on the same disclosure checklist as a conventional purchase.
- Monica asked again for a native Looker connection; her analysts rebuild the Invoca dashboard in Looker every week from CSV exports.

## Risks
- Loan Application mapping defect could leave call outcomes missing on new picklist values until it's fixed. Stacy has a workaround, so no immediate reporting gap, but it needs a resolution path before the Q4 surge.

## Next steps
- Aisha to open an integration ticket on the Loan Application mapping and loop in Stacy. Due October 12.
- Aisha to bring the loan-type QM scorecard ask to product and come back with what's possible. Due October 22.
- Aisha to log the Looker connection request with product. Due October 15.
- Andre to send October call volume and handle time actuals after the new hires ramp. Due November 6.
- Aisha to schedule the PreSense screen-pop timing check with Andre's team. Due October 20.
