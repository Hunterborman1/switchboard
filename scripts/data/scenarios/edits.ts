/**
 * Reviewer edits to generated featured files, applied in build.ts before corruption.
 * Recorded here (not hand-edited in the cache) so a rebuild is reproducible. See docs/data-review.md.
 *  - drop: remove transcript turns / Slack messages whose text starts with this prefix
 *  - from/to: replace text anywhere in the generated output
 */
import type { GenOutput } from '../lib/types.ts';

export type Edit = { drop: string } | { from: string; to: string };

export const REVIEW_EDITS: Record<string, Edit[]> = {
  // Cedar Ridge has a live Google Ads lag in this same file; "both are fine" contradicted it.
  file_cedarridge_checkin_notes: [{ from: 'Google Ads and Meta are the only platforms connected right now, and both are fine.', to: 'Google Ads and Meta are the only platforms connected right now.' }],
  // SunPeak reports the Google Ads lag on Oct 14 and Oct 20; a "no complaints" answer on Oct 19 contradicted it.
  file_sunpeak_renewal: [
    { drop: 'Cody, how are the Google Ads conversions looking these days?' },
    { drop: "They're fine. We're matching on GCLID" },
    { drop: 'And Salesforce?' },
    { drop: 'Also fine. Call records land where they' },
  ],
  // Keystone's voice agent handoff defect is reported a week later; "no issues" here contradicted it.
  file_keystone_qbr: [
    { drop: 'Can I jump in on something related? Not QM' },
    { drop: "It's fine. We're seeing it handle the after-hours claim intake" },
    { drop: 'Good. How many calls is it taking at this point?' },
    { drop: "We've got it on the after-hours line only" },
    { drop: 'Makes sense, no reason to change anything mid-surge.' },
    { drop: 'Exactly.' },
  ],
  // Bluewater raises PreSense transfer gaps two days later (Oct 9); "solid" here contradicted it.
  file_bluewater_checkin: [
    { drop: 'Good. PreSense?' },
    { drop: 'Also fine. Agents really like seeing the pages' },
    { from: 'Attribution and PreSense have been steady, so', to: 'Attribution has been steady, so' },
  ],
  // Brightline's Google Ads lag predates this call (Priyanka's email, C-1042); keep Jeff non-committal.
  file_brightline_dispatch_asr: [
    { from: 'No, the rest is fine. The screen pop is working, the guys like seeing what page the caller was on, that\'s been solid.', to: 'No, the rest is fine.' },
    { from: "Nothing I've seen. Numbers look about like they always do. I'll have a better read after the QBR.", to: "That's Dana's world, she'll bring it to the QBR. I know Priyanka's been looking at something." },
  ],
  // Ridgeway escalated the Google Ads delay two days earlier; Mike can't call it fine.
  file_ridgeway_renewal_asr: [
    { from: "We're tagging the campaigns, the Google Ads conversions are landing, the BDC team isn't complaining. So day to day it's okay.", to: "We're tagging the campaigns, the BDC team uses it. The Google piece you already know about from Tuesday. So day to day it's okay." },
  ],
  // Frontier's compliance team has an open QM scorecard ask.
  file_frontier_qbr_asr: [
    { from: "That's all fine. Stacy's team owns the scorecards and they've been happy with it.", to: "Victor's team owns the scorecards, and you already have their list from the last QBR." },
    { from: 'Okay, so that\'s PreSense, QM, tracking, all in good shape.', to: 'Okay, so that\'s PreSense and tracking.' },
  ],
  // Forward note was written in a third person's voice; the CMO's gender must match C-1042 ("him").
  file_brightline_upload_eml: [
    {
      from: "marcus forwarded this chain over, looping mei. priyanka's got the timing data on the google ads uploads. dana's on it too because the cmo noticed cpa jump. fyi they're also getting callrail outreach claiming same-day sync. pasting the bit from the recording that priyanka referenced:\n\n[10/13, 12:18 PM] Priyanka Shah: I pulled the timestamps on the last batch. call came in october 6 at 9:14am, conversion didn't land in google ads until october 9. that's 72 hours.\n[10/13, 12:18 PM] Dana Ortiz: and the cmo saw the cpa spike before the conversions even posted.\n\nneed to get ahead of this before it turns into a renewal conversation.",
      to: "sam, mei, forwarding the brightline thread. priyanka has the timing data on the google ads uploads and dana's on it too because their cmo noticed the cpa jump. fyi they're also getting callrail outreach claiming same-day sync. pasting the bit from our call last week where priyanka walked me through it (below).\n\nneed to get ahead of this before it turns into a renewal conversation, they renew jan 15.",
    },
    { from: "She's asking why our cost per booked job", to: "He's asking why our cost per booked job" },
    { from: 'before I tell her that', to: 'before I tell him that' },
    { from: "So she's looking at a number", to: "So he's looking at a number" },
  ],
  file_atlas_renewal_eml: [
    { from: "renewal isn't until dec 2026 but they're already shopping.", to: "renewal is dec 1 and they're already shopping." },
    { from: "To be fair to Diego's team, the Google Ads side is working the way we set it up, we're seeing the conversions come through and the bidding has been stable. Tanya's the one living with the delay on the appointment side, so I'll let her speak to that.", to: "To be fair to Diego's team, the platform does what we bought it for. Tanya's the one living with the delay on the appointment conversions, so I'll let her speak to that." },
  ],
  // Bluewater escalated PreSense transfer gaps on Oct 16; the COO can't call PreSense fine on Oct 22.
  file_bluewater_pricing_eml: [{ from: 'Call tracking and PreSense are doing what we need.', to: 'Call tracking does what we need, and PreSense is its own conversation with Derek.' }],
  // Tom's account-mood note must not sit in the customer-shared channel; customer agent renamed (Marcus is the Invoca CSM).
  file_northwind_slack: [
    { from: "brandon hinted they'd drop presense", to: "[[internal]]brandon hinted they'd drop presense" },
    { from: 'same agent, marcus, but', to: 'same agent, devon, but' },
  ],
  // The forward note pasted a second, redundant snippet; a Coastal agent shared a name with Brightline's Dana.
  file_coastal_transfers_eml: [
    {
      from: "pasting the bit from the recording:\n\nagent: coastal comfort, this is [name], how can i help?\ncaller: hi, i was just talking to someone about my order\nagent: okay, what's the order number?\ncaller: that's the thing, they were supposed to transfer me with it\n\nneed your eyes",
      to: "pasting the bit from the first recording on his list (below).\n\nneed your eyes",
    },
    { from: 'Coastal Comfort, this is Dana, how can I help?', to: 'Coastal Comfort, this is Keisha, how can I help?' },
  ],
  // The renewal call was Monday the 19th with Marisol, not a VP of ops.
  file_sunpeak_slack: [
    { from: 'amanda and cody from sunpeak, plus their vp ops. quick heads up: this is the renewal call from tuesday, not the qbr.', to: 'amanda, marisol and cody from sunpeak. quick heads up: this is the renewal call from yesterday, not the qbr.' },
  ],
  // Marisol Vega is SunPeak's Director of Sales, not a San Antonio supervisor.
  file_sunpeak_spanish: [{ from: 'Marisol, la supervisora de San Antonio,', to: 'Marisol, la directora de ventas,' }],
  // Northwind's PreSense transfer issue is a live critical escalation (Oct 12 Slack, Oct 16 call).
  file_northwind_checkin_asr: [
    { from: "So I know we had the transfer thing come up a couple times this quarter. How's that sitting now?", to: "Michelle's still working the PreSense transfer issue with Lena and Derek, so I'll leave that one to them today." },
    { drop: 'Better, I think. My team hasn\'t escalated it' },
    { drop: 'Knowing them, could be either.' },
    { from: "Fair. I'll still keep it open on my side, but good to hear it's quieter. ", to: '' },
    { drop: "While we're here, how are things looking on the Genesys side?" },
    { drop: 'Nothing that touches you. Your screen pops have been stable' },
    { drop: "Good. That's been the quietest part of the stack" },
    { from: 'And thanks for keeping the transfer thing moving, I know that\'s been a long one.', to: 'And thanks for staying on the transfer issue with Michelle, I know that\'s been a long one.' },
    { from: "It has. But it's quiet now, so I'll take the win.", to: "It has. Lena's team is still on it, and I'll keep you posted." },
  ],
};

function replaceAll(s: string, from: string, to: string): string {
  return s.split(from).join(to);
}

export function applyEdits(fileId: string, out: GenOutput): GenOutput {
  const edits = REVIEW_EDITS[fileId];
  if (!edits?.length) return out;
  let o: GenOutput = JSON.parse(JSON.stringify(out)) as GenOutput;
  for (const e of edits) {
    if ('drop' in e) {
      if (o.kind === 'transcript') {
        const before = o.turns.length;
        o = { ...o, turns: o.turns.filter((t) => !t.text.startsWith(e.drop)) };
        if (o.turns.length === before) throw new Error(`${fileId}: edit drop matched nothing: ${e.drop}`);
      } else if (o.kind === 'chaos_chat') {
        const before = o.messages.length;
        o = { ...o, messages: o.messages.filter((m) => !m.text.startsWith(e.drop)) };
        if (o.messages.length === before) throw new Error(`${fileId}: edit drop matched nothing: ${e.drop}`);
      } else throw new Error(`${fileId}: drop edit on ${o.kind}`);
    } else {
      const json = JSON.stringify(o);
      const f = JSON.stringify(e.from).slice(1, -1);
      if (!json.includes(f)) throw new Error(`${fileId}: edit matched nothing: ${e.from.slice(0, 60)}`);
      o = JSON.parse(replaceAll(json, f, JSON.stringify(e.to).slice(1, -1))) as GenOutput;
    }
  }
  return o;
}
