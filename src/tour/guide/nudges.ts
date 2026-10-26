/**
 * Explore mode: one nudge per screen. Every Switchboard and Agent Ops page has an entry
 * (tests/unit/tour/nudges.test.ts checks the list against src/app/routes.tsx and
 * src/platform/index.ts). A nudge is a short imperative, one line on what it shows, and
 * optionally an anchor already on that page for "Show me". Anything simulated says so.
 */
import type { AnchorId } from '../anchors';

export type Nudge = {
  /** Matched against the pathname (relative to the router basename), first match wins. */
  match: RegExp;
  /** The page, as the sidebar names it. */
  page: string;
  /** Imperative: what to try. Shown after "Try it". */
  title: string;
  /** One line: what it shows, and what's simulated. */
  body: string;
  show?: AnchorId;
};

export const NUDGES: Nudge[] = [
  // ---------------------------------------------------------------- Switchboard
  { match: /^\/app\/?$|^\/app\/overview\/?$/, page: 'Overview', title: 'See what came in and where it went', body: 'What the decision model made of each conversation, and where results went. The tools themselves are simulated.' },
  { match: /^\/app\/runs\/?$/, page: 'Conversations', title: 'Open any conversation', body: 'Each one keeps its ten steps, the quote behind every insight and its real timings.' },
  { match: /^\/app\/new\/?$/, page: 'New conversation', title: 'Bring in any conversation', body: 'Upload a PDF, Word file, slides, transcript or email, paste text, or pick from the library. It runs for real.', show: 'new.upload' },
  { match: /^\/app\/runs\/[^/]+/, page: 'Conversation', title: 'See where the time went', body: 'The Timing card draws every step from its real timestamps. Replay steps plays it back at recorded speed.', show: 'run.timing' },
  { match: /^\/app\/review(\/|$)/, page: 'Review', title: 'Approve, edit or reject one', body: 'Press A, E or R. Each decision records who made it and becomes a labelled example.', show: 'review.approve' },
  { match: /^\/app\/insights(\/|$)/, page: 'Insights', title: 'Open an insight', body: 'Everything Signal Loop found, with its quote, its score and where it went.' },
  { match: /^\/app\/themes\/?$/, page: 'Themes', title: 'Open a theme', body: 'Similar feedback from different accounts, grouped in code, with the ARR behind it.', show: 'theme.c1042' },
  { match: /^\/app\/themes\/[^/]+/, page: 'Theme', title: 'Follow a quote back to its call', body: 'Each representative quote links to the conversation it came from.', show: 'theme.quotes' },
  { match: /^\/app\/routing(\/|$)/, page: 'Routing', title: 'Change who hears about what', body: 'Edit a rule and the flows re-route. No prompt changes, and only your workspace sees it.', show: 'routing.rule.pricing' },
  { match: /^\/app\/destinations(\/|$)/, page: 'Deliveries', title: 'Move a ticket to Shipped', body: 'The CSM who raised it hears back. The tools are simulated; the content, tags and receipts are generated for real.', show: 'ticket.state' },
  { match: /^\/app\/loop(\/|$)/, page: 'Close the loop', title: 'Read the drafted customer note', body: 'When feedback ships, the CSM gets the credit and a note to send. Drafted, never sent for them.', show: 'loop.note' },
  { match: /^\/app\/evals(\/|$)/, page: 'Quality', title: 'Try to promote the candidate prompt', body: 'The go-live check runs every gate rule against hand-labelled files. It looks fine on recall.', show: 'evals.promote' },
  { match: /^\/app\/analyses(\/|$)/, page: 'Analyses', title: 'See what’s built and what isn’t', body: 'Signal Loop is built. The others are listed and marked Not built: one analysis, done properly, in 48 hours.' },
  { match: /^\/app\/connections\/?$/, page: 'Connections', title: 'Disconnect a tool', body: 'Connections are simulated: disconnect Jira and its rules route to triage. Reconnect to restore them.', show: 'connections.grid' },
  { match: /^\/app\/connections\/[^/]+/, page: 'Connection', title: 'Send a test', body: 'Simulated: it records a test with a receipt in your workspace. Nothing reaches the real tool.' },
  { match: /^\/app\/people(\/|$)/, page: 'People', title: 'Change someone’s handle', body: 'A fictional directory. Handles are how each simulated tool tags people; remove someone and their rules go to triage.' },
  { match: /^\/app\/health(\/|$)/, page: 'Usage and health', title: 'Check the live AI budget', body: 'A hard cap on real AI spend for every viewer. Past it, runs replay recorded live runs.', show: 'health.budget' },
  { match: /^\/app\/settings(\/|$)/, page: 'Settings', title: 'See the exact models', body: 'The only page with model ids: decision, main and backup, chosen by measurement. Reset your workspace here too.' },
  { match: /^\/app\/claude(\/|$)/, page: 'Connect Claude', title: 'Connect Claude and ask it how this was built', body: 'Create a token, add the MCP server to Claude, and ask about any decision. It reads the docs and this workspace.' },
  // ---------------------------------------------------------------- Agent Ops
  { match: /^\/ops\/?$|^\/ops\/summary\/?$/, page: 'Agent Ops overview', title: 'Read the exec view', body: 'Hours returned, what that time is worth and AI cost, per agent. The history and the RFP Responder are simulated.', show: 'ops.overview.kpis' },
  { match: /^\/ops\/agents\/?$/, page: 'Agent registry', title: 'Open an agent', body: 'Every agent has an owner, a review date and a score against the standard. The RFP Responder is simulated.', show: 'ops.registry.signal' },
  { match: /^\/ops\/agents\/[^/]+/, page: 'Agent', title: 'Check who owns it', body: 'A named owner, a business owner and a review schedule. An overdue review fails the standard.', show: 'ops.agent.review' },
  { match: /^\/ops\/usage(\/|$)/, page: 'Usage', title: 'Find yourself in the live panel', body: 'Real people using this demo right now, with your session marked. The six-week history is simulated.', show: 'ops.usage.live' },
  { match: /^\/ops\/logs(\/|$)/, page: 'Logs and traces', title: 'Jump to your last run', body: 'Every step, AI call and delivery as structured logs, with one trace per run.', show: 'ops.logs.trace' },
  { match: /^\/ops\/traces\/[^/]+/, page: 'Trace', title: 'Select a step on the timeline', body: 'Each bar is one step or model call on a shared clock, with its tokens and cost.', show: 'ops.trace.waterfall' },
  { match: /^\/ops\/reliability(\/|$)/, page: 'Reliability', title: 'Check the promises', body: 'Service targets with error budgets, and alerts that carry an owner and a runbook.', show: 'ops.slos' },
  { match: /^\/ops\/cost(\/|$)/, page: 'Cost', title: 'Compare cost per task', body: 'What each agent spends on AI against its cap. Signal Loop’s spend is real; the RFP Responder’s is simulated.' },
  { match: /^\/ops\/runbook(\/|$)/, page: 'Runbook', title: 'Read what to do when it breaks', body: 'Owners, steps and the rollback for each agent, written before anything breaks.' },
  { match: /^\/ops\/standard(\/|$)/, page: 'Standard and reviews', title: 'Select a cell to see its evidence', body: 'Nine checks every agent is held to, whoever built it. A gap is a reason to act.' },
];

const FALLBACK: Omit<Nudge, 'match'> = { page: 'This page', title: 'Explore on your own', body: 'Everything here is the working product. Resume the presentation whenever you like.' };

export function nudgeFor(pathname: string): Omit<Nudge, 'match'> {
  return NUDGES.find((n) => n.match.test(pathname)) ?? FALLBACK;
}
