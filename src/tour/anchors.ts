/**
 * Every element the walkthrough spotlights. The product UI places these as
 * `data-tour="<id>"` attributes (use the `tourAnchor(id)` helper); the tour engine finds
 * them by `[data-tour="<id>"]`. Add new ids here first so both sides agree.
 */
export const ANCHORS = {
  // app shell
  'nav.new': 'Sidebar item: New call',
  'nav.review': 'Sidebar item: Review queue (with count badge)',
  'nav.routing': 'Sidebar item: Routing',
  'nav.themes': 'Sidebar item: Themes',
  'nav.loop': 'Sidebar item: CSM loop',
  'nav.evals': 'Sidebar item: Evals',
  'budget.pill': 'Live-AI budget pill in the header',
  // ch1 · new call + file picker
  'new.upload': 'The Upload / choose file button on New call',
  'picker.dialog': 'The file picker dialog',
  'picker.folder': 'The folder tree in the picker',
  'picker.recommended': 'The highlighted recommended file row (C-1042)',
  'picker.preview': 'The file preview pane',
  'picker.open': 'The picker Open button',
  'new.run': 'The Run pipeline button',
  // ch2 · run view
  'run.stepper': 'The 10-step pipeline graph / stepper',
  'run.transcript': 'The transcript pane',
  'run.redaction': 'Redaction before/after toggle',
  'run.screen': 'Screen result card (actionable / injection flag)',
  'run.insights': 'Extracted insight cards list',
  'run.dropped': 'The insight/quote that failed grounding',
  'run.ground': 'The Ground step in the pipeline stepper (ch2.ground on runs where every quote grounds)',
  'run.gate': 'Confidence gauge / gate result',
  'run.trace': 'Trace panel: model, tokens, cost, ms per step',
  // ch3 · review
  'review.queue': 'Review queue list',
  'review.item': 'First item in the queue',
  'review.why': 'The why-is-this-here severity chip',
  'review.evidence': 'Evidence in context',
  'review.approve': 'Approve button',
  'review.edit': 'Edit button',
  'review.editform': 'The edit form that replaces the Edit button',
  // ch4 · routing
  'routing.rules': 'Rules table',
  'routing.rule.pricing': 'The pricing-objection rule row',
  'routing.sankey': 'Routing Sankey',
  'routing.deliveries': 'Delivery log',
  'dest.jira': 'Jira ticket preview',
  'dest.slack': 'Slack message preview',
  // ch5 · themes
  'themes.list': 'Theme list',
  'theme.c1042': 'The theme the C-1042 insight joined',
  'theme.trend': 'Theme trend chart',
  'theme.quotes': 'Representative quotes',
  'theme.arr': 'ARR at stake stat',
  // ch6 · close the loop
  'ticket.state': 'Jira ticket state control (move to Shipped)',
  'loop.inbox': 'CSM notifications inbox',
  'loop.shipped': 'The newest Shipped notification in the CSM inbox',
  'loop.note': 'Draft note to the customer',
  // ch7 · evals
  'evals.metrics': 'Precision/recall bars',
  'evals.levels': 'Per-mess-level heatmap',
  'evals.candidate': 'Candidate prompt card',
  'evals.promote': 'Promote button',
  'evals.gate': 'Promotion gate result',
  'health.budget': 'Budget gauge on Health',
  // signal loop → platform
  'nav.agentops': 'Link from Signal Loop into Agent Ops (header or sidebar)',
  'nav.menu': 'Mobile Menu button that opens the nav drawer (phones only)',
  // ch8 · operate it (Agent Ops platform, /ops)
  'ops.overview.kpis': 'Agent Ops overview KPI strip (hours returned, value, AI cost, ROI, active users)',
  'ops.overview.chart': 'Hours returned per week, stacked by agent',
  'ops.overview.attention': 'Needs-attention list (overdue reviews, SLO breaches, standard gaps)',
  'ops.registry': 'Agent registry table',
  'ops.registry.signal': 'The Signal Loop row in the registry',
  'ops.agent.standard': 'Agent standard checklist on the agent page',
  'ops.agent.review': 'Owner + review cadence block on the agent page',
  'ops.usage.live': 'Live viewers panel ("that\'s you")',
  'ops.usage.heatmap': 'Usage heatmap by weekday × hour',
  'ops.logs': 'Log explorer table',
  'ops.logs.trace': 'Trace filter / "your last run" quick filter',
  'ops.trace.waterfall': 'Trace span waterfall',
  'ops.slos': 'SLO cards',
  'ops.alerts': 'Alerts list',
  'ops.cost': 'Cost per agent / per unit panel',
} as const;

export type AnchorId = keyof typeof ANCHORS;

export function tourAnchor(id: AnchorId): { 'data-tour': AnchorId } {
  return { 'data-tour': id };
}
