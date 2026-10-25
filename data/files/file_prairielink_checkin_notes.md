# Prairie Link Broadband · check-in · October 15, 2026

**Attendees:** Dale Henderson (Director of Digital), Ryan Fischer (Web Development Lead), Tom Lindqvist (Invoca CSM)

## Summary
We did a light check-in on the new single-page app order flow and how call tracking is behaving since the September relaunch. Ryan walked through what the web team is seeing, and Dale asked what the agency needs in order to view campaign performance. Tom was clear that the agency sharing question is not something he can confirm and he will look into it.

## Discussion
- Prairie Link is running fiber expansion across five states, and this quarter is mostly about keeping the new order flow steady while the agency ramps on paid search.
- Call volumes are running at the usual level for this time of the season, roughly 1,900 to 2,100 calls a month across tracked campaigns.
- Most of those calls are still Google Ads driven, with Marketo picking up the rest from web form and nurture activity.
- The AI Voice Agent continues to take the outage calls and route people through the usual flow. Dale says that piece is fine.
- Ryan mentioned the web team is on a two-week sprint cadence and deploying to production on Tuesdays, which matters for any tag changes.
- Dale brought up the agency review. They are presenting a monthly performance read the first week of November and want the agency to pull numbers on their own.
- Ryan has two developers who can run a test page or a staging build on short notice if Invoca needs to see the behavior in context.
- Tom asked whether any other tracking has moved in the same window. Ryan said no, only the order flow changed in September.

## Product feedback
- Since the September relaunch of the order flow as a single-page app, DNI only swaps the number on the first page load; after that every visitor sees the default number.
- Dale asked whether the campaign dashboard can be shared as a read-only link with their agency, without creating a user seat.

## Risks
- If DNI is not swapping after the first page load, new order-flow visitors are reaching the default number, which makes campaign attribution on those calls unreliable heading into the agency's November read.

## Next steps
- Tom to open a case with the DNI team on the single-page app behavior and confirm whether a staging URL is helpful before the next sprint. Owner: Tom, by October 16.
- Tom to check internally on whether the campaign dashboard offers a read-only share option and what the agency would need on their side. Owner: Tom, by October 20.
- Ryan to send the staging URL and a sample of test sessions from the new order flow once the sprint closes. Owner: Ryan, by October 23.
- Tom to reconvene with Dale and Ryan the last week of October so there is runway before the agency's first-week-of-November review. Owner: Tom, by October 27.
