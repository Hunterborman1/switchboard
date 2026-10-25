# Frontier Home Lending · Escalation · October 23, 2026

**Attendees:** Andre Williams (Director, Contact Center Ops, Frontier Home Lending); Aisha Coleman (CSM, Invoca)

## Summary
Andre raised two issues he says his team is hitting in production. We walked through what they are seeing and when it started. He wants them logged and routed before the November push.

## Discussion
- Volume is holding around 61,000 calls a month, up about 6% since Labor Day. Refi inbound is the growth.
- Ramp is set: 22 new loan officers through the Five9 queue starting November 2, floor space is ready, headsets and licensing ordered.
- Salesforce Loan Application object is still the system of record for outcomes. Robert's team owns the field changes on their side.
- Andre noted the Houston team runs a different after-hours schedule, so his numbers exclude that site.
- Briefly asked about cadence into year end. Agreed to keep the monthly check-in and add a short one before the November ramp.

## Product feedback
- Andre: "When Robert's team added a field to our Loan Application object, the Salesforce sync just stopped writing call records to the custom objects. No error on our end, we only caught it because a manager said his dashboard looked thin."
- Andre: "On our new single-page application, once the borrower moves past the first step, dynamic number insertion stops swapping the number. Calls from the new checkout are landing in Google Ads as direct traffic."

## Risks
- If the Salesforce sync stays down, call outcomes won't reach the Loan Application objects and reporting for the November ramp will be incomplete.
- Misattributed checkout calls could distort Google Ads bidding during a high-volume stretch.

## Next steps
- Aisha to log both items and send Andre the case numbers by end of day October 23.
- Aisha to pull the sync error history and the DNI tag behavior on the SPA and share findings by October 27.
- Andre to send Aisha the field change Robert's team made and the URL path for the new checkout by October 26.
- Aisha to set a 30-minute pre-ramp check-in for the week of October 26.
