/**
 * The one registry of project docs for AI assistants. It feeds MCP (`read_doc` and the
 * switchboard://docs resources), the gated Markdown URLs, the docs .zip with its INDEX.md, and
 * llms.txt (src/worker/index.ts). Repo Markdown is bundled into the Worker as text (wrangler.jsonc
 * "rules": *.md as Text); the write-up and Q&A pages are rendered from the same data as the
 * pages (src/shared/writeup).
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
import { CHAPTER_PAGES } from '../../shared/writeup/chapters.ts';
import { QUESTION_PAGES } from '../../shared/writeup/questions.ts';
import { chapterMarkdown, questionMarkdown, questionsIndexMarkdown, writeupIndexMarkdown } from '../../shared/writeup/markdown.ts';
import { QUESTIONS_MD, WRITEUP_MD, chapterMd, chapterZipFile, questionMd, questionZipFile } from '../../shared/writeup/site.ts';
import { REPO_URL, SITE_URL } from '../../shared/platform.ts';

export type DocGroup = 'writeup' | 'questions' | 'project';

export type Doc = {
  /** read_doc name and resource id. */
  name: string;
  title: string;
  description: string;
  group: DocGroup;
  /** Where it is served under /repo/invoca/ (gated). */
  url: string;
  /**
   * Its path inside the .zip. Repo docs keep their repo path (and are served there too); the
   * pages sit in write-up/ and questions/. The two index pages are left out: INDEX.md does
   * their job in the .zip.
   */
  file?: string;
  /** A repo file, also served at its repo path. */
  repo?: boolean;
  text: string;
};

const WRITEUP_DOCS: Doc[] = [
  { name: 'writeup', title: 'The write-up: index', description: 'What Switchboard is, short answers on process design, the build, rollout and trust and the next 12–18 months, then the ten chapters and the Q&A, each linked to its page.', group: 'writeup', url: WRITEUP_MD, text: writeupIndexMarkdown() },
  ...CHAPTER_PAGES.map(
    (c): Doc => ({
      name: `writeup_${c.id}`,
      title: `Chapter ${c.number}: ${c.title}`,
      description: c.summary,
      group: 'writeup',
      url: chapterMd(c.id),
      file: chapterZipFile(c.number, c.id),
      text: chapterMarkdown(c),
    }),
  ),
];

const QUESTION_DOCS: Doc[] = [
  { name: 'questions', title: 'Questions and answers: index', description: 'The seven Q&A topics, each with a one-line summary and a link to its page.', group: 'questions', url: QUESTIONS_MD, text: questionsIndexMarkdown() },
  ...QUESTION_PAGES.map(
    (q): Doc => ({
      name: `question_${q.id.replace(/-/g, '_')}`,
      title: `Q&A: ${q.title}`,
      description: q.blurb,
      group: 'questions',
      url: questionMd(q.id),
      file: questionZipFile(q.id),
      text: questionMarkdown(q),
    }),
  ),
];

const repoDoc = (d: Omit<Doc, 'group' | 'repo'>): Doc => ({ ...d, group: 'project', repo: true });

const PROJECT_DOCS: Doc[] = [
  repoDoc({ name: 'walkthrough', title: 'The walkthrough', description: 'Every part of the presentation: what it shows, why, and the decisions behind it, with a source for every number.', file: 'docs/WALKTHROUGH.md', url: 'walkthrough.md', text: WALKTHROUGH }),
  repoDoc({ name: 'readme', title: 'README', description: 'What the project is, what is real and simulated, how it is built and how to run it.', file: 'README.md', url: 'README.md', text: README }),
  repoDoc({ name: 'architecture', title: 'Architecture', description: 'How a run executes: fast path, durable Workflow, decision tier, budget, access.', file: 'docs/ARCHITECTURE.md', url: 'docs/ARCHITECTURE.md', text: ARCHITECTURE }),
  repoDoc({ name: 'decision_models', title: 'Decision model report', description: 'How the triage and second-opinion model was chosen, with the measured numbers.', file: 'docs/reports/decision-models.md', url: 'docs/reports/decision-models.md', text: DECISION_MODELS }),
  repoDoc({ name: 'robustness', title: 'Robustness report', description: 'Every input format and edge case driven through the real UI and live AI, with the result of each.', file: 'docs/reports/robustness.md', url: 'docs/reports/robustness.md', text: ROBUSTNESS }),
  repoDoc({ name: 'verify_data', title: 'Data verification report', description: 'The 48 sample files run end to end: golden insights found, precision, hard failures and spend.', file: 'docs/reports/verify-data.md', url: 'docs/reports/verify-data.md', text: VERIFY_DATA }),
  repoDoc({ name: 'design', title: 'Design system', description: 'The design rules and tokens every screen follows.', file: 'docs/DESIGN.md', url: 'docs/DESIGN.md', text: DESIGN }),
  repoDoc({ name: 'runbook', title: 'Runbook', description: 'Alerts, model fallback, the budget kill switch, rollback and incident steps.', file: 'docs/RUNBOOK.md', url: 'docs/RUNBOOK.md', text: RUNBOOK }),
  repoDoc({ name: 'mcp', title: 'MCP server', description: 'How to connect Claude, the tools, tokens and how to add a tool.', file: 'docs/MCP.md', url: 'docs/MCP.md', text: MCP }),
  repoDoc({ name: 'speaker_notes', title: 'Speaker notes', description: 'What the presenter says at each part, and likely questions.', file: 'docs/speaker-notes.md', url: 'docs/speaker-notes.md', text: SPEAKER_NOTES }),
];

export const DOCS: Doc[] = [...WRITEUP_DOCS, ...QUESTION_DOCS, ...PROJECT_DOCS];

export const docByName = (name: string): Doc | undefined => DOCS.find((d) => d.name === name);

/** A doc by the path after /repo/invoca/: its served URL, or a repo doc's repo path. */
export const docByPath = (path: string): Doc | undefined => DOCS.find((d) => d.url === path || (d.repo && d.file === path));

export const ZIP_NAME = 'switchboard-docs.zip';
export const MCP_URL = `${SITE_URL}/mcp`;

const ABOUT =
  'Switchboard reads any customer conversation, decides what it is, runs the analyses that apply and sends the result to the right people in their own tools. Signal Loop is the analysis built for option 3 of Invoca’s AI Operations Lead brief (the feedback loop), built from scratch in 48 hours by Hunter Borman. Agent Ops is the sibling product for operating every agent.';

const GROUPS: { group: DocGroup; title: string; about: string }[] = [
  { group: 'writeup', title: 'The write-up, one file per chapter', about: 'The ten chapters of the presentation, each written out with the decisions, numbers, sources and honest gaps behind it.' },
  { group: 'questions', title: 'Questions and answers, one file per topic', about: 'The detail behind the questions the panel is likely to ask.' },
  { group: 'project', title: 'Project docs', about: 'The walkthrough in full, the README, the architecture, the reports and the runbook.' },
];

/** INDEX.md at the root of the .zip: what each file is, where it lives on the site, and how to connect over MCP. */
export function indexMarkdown(): string {
  const zipped = DOCS.filter((d) => d.file);
  return [
    '# Switchboard docs for AI assistants',
    '',
    ABOUT,
    '',
    'All of the AI is built and runs live. Every account, person and call is fictional, and the connectors to Slack, Jira, Salesforce and the rest are simulated; the product and these files say which is which. Where a file and the code disagree, the code wins.',
    '',
    '## Start here',
    '',
    `1. \`${chapterZipFile(1, CHAPTER_PAGES[0]!.id)}\` to \`${chapterZipFile(CHAPTER_PAGES.length, CHAPTER_PAGES[CHAPTER_PAGES.length - 1]!.id)}\`: the write-up, one short file per chapter, in order.`,
    '2. `questions/`: the Q&A, one file per topic (cost, security, failure, build vs buy, metrics, Agent Ops, what I’d do differently).',
    '3. `docs/WALKTHROUGH.md`: every part of the presentation in full, with a source for every number.',
    '',
    ...GROUPS.flatMap((g) => [
      `## ${g.title}`,
      '',
      g.about,
      '',
      '| File | What it is | On the site |',
      '|---|---|---|',
      ...zipped.filter((d) => d.group === g.group).map((d) => `| \`${d.file}\` | **${d.title}.** ${d.description} | ${SITE_URL}/${d.url} |`),
      '',
    ]),
    '## On the site',
    '',
    `The live site is ${SITE_URL}/ (behind a password or a signed link). Every page of the write-up and the Q&A is also served as Markdown at its URL plus \`.md\`, for example ${SITE_URL}/${chapterMd(CHAPTER_PAGES[0]!.id)}. The indexes are at ${SITE_URL}/${WRITEUP_MD} and ${SITE_URL}/${QUESTIONS_MD}.`,
    '',
    `- This bundle: ${SITE_URL}/${ZIP_NAME}`,
    `- Every Markdown URL in the llms.txt convention: ${SITE_URL}/llms.txt`,
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

/** /llms.txt: what this is in one line, then every Markdown URL by group, the .zip and MCP. */
export function llmsTxt(): string {
  return [
    '# Switchboard',
    '',
    `> ${ABOUT}`,
    '',
    'Every link below is behind the site’s sign-in (a password or a signed link); the MCP server takes a bearer token instead. Every page of the write-up and the Q&A is served as Markdown at its URL plus `.md`.',
    '',
    ...GROUPS.flatMap((g) => [`## ${g.title.replace(/, one file per (chapter|topic)$/, '')}`, '', ...DOCS.filter((d) => d.group === g.group).map((d) => `- [${d.title}](${SITE_URL}/${d.url}): ${d.description}`), '']),
    '## Download',
    '',
    `- [All docs as one .zip](${SITE_URL}/${ZIP_NAME}): every chapter, question and project doc as Markdown, plus INDEX.md`,
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

/** INDEX.md, every chapter and question in its folder, and every repo doc at its repo path. Stored, not compressed: it is small text. */
export function docsZip(): Uint8Array {
  if (!zipped) {
    const files: Record<string, Uint8Array> = { 'INDEX.md': strToU8(indexMarkdown()) };
    for (const d of DOCS) if (d.file) files[d.file] = strToU8(d.text);
    zipped = zipSync(files, { level: 0 });
  }
  return zipped;
}
