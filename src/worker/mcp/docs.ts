/** Project docs bundled into the Worker (wrangler.jsonc "rules": *.md as Text) and served over MCP. */
import README from '../../../README.md';
import WALKTHROUGH from '../../../docs/WALKTHROUGH.md';
import ARCHITECTURE from '../../../docs/ARCHITECTURE.md';
import DESIGN from '../../../docs/DESIGN.md';
import RUNBOOK from '../../../docs/RUNBOOK.md';
import DECISION_MODELS from '../../../docs/reports/decision-models.md';
import SPEAKER_NOTES from '../../../docs/speaker-notes.md';
import MCP from '../../../docs/MCP.md';

export type Doc = { name: string; title: string; description: string; text: string };

export const DOCS: Doc[] = [
  { name: 'walkthrough', title: 'The walkthrough', description: 'Every part of the presentation: what it shows, why, and the decisions behind it. Start here.', text: WALKTHROUGH },
  { name: 'readme', title: 'README', description: 'What the project is, what is real and simulated, how it is built and how to run it.', text: README },
  { name: 'architecture', title: 'Architecture', description: 'How a run executes: fast path, durable Workflow, decision tier, budget, access.', text: ARCHITECTURE },
  { name: 'decision_models', title: 'Decision model report', description: 'How the triage and second-opinion model was chosen, with the measured numbers.', text: DECISION_MODELS },
  { name: 'design', title: 'Design system', description: 'The design rules and tokens every screen follows.', text: DESIGN },
  { name: 'runbook', title: 'Runbook', description: 'Alerts, model fallback, the budget kill switch, rollback and incident steps.', text: RUNBOOK },
  { name: 'mcp', title: 'MCP server', description: 'How to connect Claude, the tools, tokens and how to add a tool.', text: MCP },
  { name: 'speaker_notes', title: 'Speaker notes', description: 'What the presenter says at each part, and likely questions.', text: SPEAKER_NOTES },
];

export const docByName = (name: string): Doc | undefined => DOCS.find((d) => d.name === name);
