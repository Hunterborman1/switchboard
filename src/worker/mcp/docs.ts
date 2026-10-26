/**
 * The one registry of project docs for AI assistants. It feeds MCP (`read_doc` and the
 * switchboard://docs resources), the gated Markdown URLs, the docs .zip with its INDEX.md, and
 * llms.txt (src/worker/index.ts). Repo Markdown is bundled into the Worker as text (wrangler.jsonc
 * "rules": *.md as Text); the write-up is rendered from the same module as the page.
 */
import { strToU8, zipSync } from 'fflate';
import README from '../../../README.md';
import WALKTHROUGH from '../../../docs/WALKTHROUGH.md';
import ARCHITECTURE from '../../../docs/ARCHITECTURE.md';
import DESIGN from '../../../docs/DESIGN.md';
import RUNBOOK from '../../../docs/RUNBOOK.md';
import MCP from '../../../docs/MCP.md';
import SPEAKER_NOTES from '../../../docs/speaker-notes.md';
import DECISION_MODELS from '../../../docs/reports/decision-models.md';
import ROBUSTNESS from '../../../docs/reports/robustness.md';
import VERIFY_DATA from '../../../docs/reports/verify-data.md';
import { writeupMarkdown } from '../../shared/writeup/markdown.ts';
import { REPO_URL, SITE_URL } from '../../shared/platform.ts';

export type Doc = {
  /** read_doc name and resource id. */
  name: string;
  title: string;
  description: string;
  /** Path inside the .zip, as in the repo (the write-up is generated, so it sits at the root). */
  file: string;
  /** Where it is served under /repo/invoca/ (gated). */
  url: string;
  text: string;
};

export const DOCS: Doc[] = [
  { name: 'walkthrough', title: 'The walkthrough', description: 'Every part of the presentation: what it shows, why, and the decisions behind it. Start here.', file: 'docs/WALKTHROUGH.md', url: 'walkthrough.md', text: WALKTHROUGH },
  { name: 'writeup', title: 'Write-up and Q&A', description: 'The written version: the problem, Switchboard, Signal Loop, rollout, what’s next, then the Q&A on cost, security, failure, build vs buy, metrics, Agent Ops and what I’d do differently.', file: 'write-up.md', url: 'write-up.md', text: writeupMarkdown() },
  { name: 'readme', title: 'README', description: 'What the project is, what is real and simulated, how it is built and how to run it.', file: 'README.md', url: 'README.md', text: README },
  { name: 'architecture', title: 'Architecture', description: 'How a run executes: fast path, durable Workflow, decision tier, budget, access.', file: 'docs/ARCHITECTURE.md', url: 'docs/ARCHITECTURE.md', text: ARCHITECTURE },
  { name: 'decision_models', title: 'Decision model report', description: 'How the triage and second-opinion model was chosen, with the measured numbers.', file: 'docs/reports/decision-models.md', url: 'docs/reports/decision-models.md', text: DECISION_MODELS },
  { name: 'robustness', title: 'Robustness report', description: 'Every input format and edge case driven through the real UI and live AI, with the result of each.', file: 'docs/reports/robustness.md', url: 'docs/reports/robustness.md', text: ROBUSTNESS },
  { name: 'verify_data', title: 'Data verification report', description: 'The 48 sample files run end to end: golden insights found, precision, hard failures and spend.', file: 'docs/reports/verify-data.md', url: 'docs/reports/verify-data.md', text: VERIFY_DATA },
  { name: 'design', title: 'Design system', description: 'The design rules and tokens every screen follows.', file: 'docs/DESIGN.md', url: 'docs/DESIGN.md', text: DESIGN },
  { name: 'runbook', title: 'Runbook', description: 'Alerts, model fallback, the budget kill switch, rollback and incident steps.', file: 'docs/RUNBOOK.md', url: 'docs/RUNBOOK.md', text: RUNBOOK },
  { name: 'mcp', title: 'MCP server', description: 'How to connect Claude, the tools, tokens and how to add a tool.', file: 'docs/MCP.md', url: 'docs/MCP.md', text: MCP },
  { name: 'speaker_notes', title: 'Speaker notes', description: 'What the presenter says at each part, and likely questions.', file: 'docs/speaker-notes.md', url: 'docs/speaker-notes.md', text: SPEAKER_NOTES },
];

export const docByName = (name: string): Doc | undefined => DOCS.find((d) => d.name === name);

/** A doc by the path after /repo/invoca/: its served URL, or its repo path. */
export const docByPath = (path: string): Doc | undefined => DOCS.find((d) => d.url === path || d.file === path);

export const ZIP_NAME = 'switchboard-docs.zip';
export const MCP_URL = `${SITE_URL}/mcp`;

const ABOUT =
  'Switchboard reads any customer conversation, decides what it is, runs the analyses that apply and sends the result to the right people in their own tools. Signal Loop is the analysis built for option 3 of Invoca’s AI Operations Lead brief (the feedback loop), built from scratch in 48 hours by Hunter Borman. Agent Ops is the sibling product for operating every agent.';

/** INDEX.md at the root of the .zip: what each file is, and how to connect over MCP. */
export function indexMarkdown(): string {
  return [
    '# Switchboard docs for AI assistants',
    '',
    ABOUT,
    '',
    'All of the AI is built and runs live. Every account, person and call is fictional, and the connectors to Slack, Jira, Salesforce and the rest are simulated; the product and these files say which is which. Where a file and the code disagree, the code wins.',
    '',
    '## Start here',
    '',
    '1. `write-up.md`: the short version, then the Q&A.',
    '2. `docs/WALKTHROUGH.md`: every part of the presentation with its reasoning and sources.',
    '',
    '## Files',
    '',
    '| File | What it is |',
    '|---|---|',
    ...DOCS.map((d) => `| \`${d.file}\` | **${d.title}.** ${d.description} |`),
    '',
    '## On the site',
    '',
    `The live site is ${SITE_URL}/ (behind a password or a signed link). Each file is also served there as Markdown:`,
    '',
    ...DOCS.map((d) => `- \`${d.file}\`: ${SITE_URL}/${d.url}`),
    `- This bundle: ${SITE_URL}/${ZIP_NAME}`,
    `- An index in the llms.txt convention: ${SITE_URL}/llms.txt`,
    '',
    '## Connect Claude over MCP',
    '',
    'The MCP server gives Claude these docs and the live system: process a conversation through the real pipeline, read runs, insights, themes, routing rules and deliveries, review an item, and see Agent Ops.',
    '',
    `1. Sign in, open **Workspace › Connect Claude** (${SITE_URL}/app/claude) and create a token. It acts as your own workspace for 7 days and is shown once.`,
    '2. Add the server to Claude Code:',
    '',
    '   ```sh',
    `   claude mcp add --transport http switchboard ${MCP_URL} \\`,
    '     --header "Authorization: Bearer <token>"',
    '   ```',
    '',
    '3. Claude Desktop: see `docs/MCP.md` (it uses `mcp-remote`). Claude.ai web connectors need OAuth, which this demo does not run.',
    '',
    `Docs over MCP: the \`read_doc\` tool takes ${DOCS.map((d) => `\`${d.name}\``).join(', ')}.`,
    '',
    `Source code: ${REPO_URL}`,
    '',
  ].join('\n');
}

/** /llms.txt: what this is in one line, then links to every Markdown file, the .zip and MCP. */
export function llmsTxt(): string {
  return [
    '# Switchboard',
    '',
    `> ${ABOUT}`,
    '',
    'Every link below is behind the site’s sign-in (a password or a signed link); the MCP server takes a bearer token instead.',
    '',
    '## Docs',
    '',
    ...DOCS.map((d) => `- [${d.title}](${SITE_URL}/${d.url}): ${d.description}`),
    '',
    '## Download',
    '',
    `- [All docs as one .zip](${SITE_URL}/${ZIP_NAME}): every file above as Markdown, plus INDEX.md`,
    '',
    '## MCP',
    '',
    `- [MCP server](${MCP_URL}): Streamable HTTP. Create a token at ${SITE_URL}/app/claude, then send it as \`Authorization: Bearer <token>\``,
    '',
    '## Optional',
    '',
    `- [Source code](${REPO_URL}): README, AGENTS.md, docs/ and the skills for extending it`,
    '',
  ].join('\n');
}

let zipped: Uint8Array | null = null;

/** Every doc at its repo path plus INDEX.md. Stored, not compressed: it is small text. */
export function docsZip(): Uint8Array {
  if (!zipped) {
    const files: Record<string, Uint8Array> = { 'INDEX.md': strToU8(indexMarkdown()) };
    for (const d of DOCS) files[d.file] = strToU8(d.text);
    zipped = zipSync(files, { level: 0 });
  }
  return zipped;
}
