/**
 * What the write-up's index says, and where every write-up and Q&A page lives: its route, its
 * Markdown URL and its file in the docs .zip. One place, so the pages, the Markdown, the Worker
 * routes, llms.txt and the .zip agree.
 */
import { REPO_URL } from '../platform.ts';

export const HERO = {
  kicker: 'Option 3, the feedback loop',
  title: 'Every call is a signal.',
  lede: 'I built Switchboard from scratch in 48 hours. It reads any customer conversation and works out what it is. Then it runs the analyses that apply and sends the result to the right people, in their own tools. Signal Loop is the analysis I built for this brief. It turns what customers tell Invoca’s CSMs into product insight, with the quote attached, sent to the person who can act on it.',
  facts: ['All of the AI is built and working, not a mock-up', 'Fictional data and simulated connections, labelled as such', 'Assumptions marked on every page', `Source code on [GitHub](${REPO_URL})`],
};

export const INDEX_COPY = {
  chaptersTitle: 'The ten chapters',
  chaptersLede: 'One page for each chapter of the presentation. Each page tells the chapter’s story, then adds what the screen leaves out: why I built it that way, the numbers and where they come from, and the honest gaps.',
  questionsTitle: 'Questions and answers',
  questionsLede: 'The detail behind the questions I expect. The cost figures are read live from this deployment.',
};

export const WRITEUP_TITLE = 'Switchboard: the write-up';
export const QUESTIONS_TITLE = 'Switchboard: questions and answers';

// ---------------------------------------------------------------- where things live

/** Site routes (relative to /repo/invoca). */
export const WRITEUP_PATH = '/write-up';
export const QUESTIONS_PATH = '/backup';
export const chapterPath = (id: string) => `${WRITEUP_PATH}/${id}`;
export const questionPath = (id: string) => `${QUESTIONS_PATH}/${id}`;
/** Where the presentation starts a chapter: its first step (src/web/pages/Walkthrough.tsx). */
export const presentationPath = (id: string) => `/walkthrough/${id}`;

/** Markdown URLs, relative to /repo/invoca/: every page's URL plus ".md". */
export const WRITEUP_MD = 'write-up.md';
export const QUESTIONS_MD = 'backup.md';
export const chapterMd = (id: string) => `write-up/${id}.md`;
export const questionMd = (id: string) => `backup/${id}.md`;

/** Files in the docs .zip: numbered chapters in write-up/, one file per question in questions/. */
export const chapterZipFile = (n: number, id: string) => `write-up/${String(n).padStart(2, '0')}-${id}.md`;
export const questionZipFile = (id: string) => `questions/${id}.md`;

// ---------------------------------------------------------------- sources

/** A link to a file in the repository, labelled with its file name: "[latest.json](…)". */
export const src = (path: string): string => `[${path.split('/').pop()}](${REPO_URL}/blob/main/${path})`;

/** Several sources, comma-separated. */
export const srcs = (...paths: string[]): string => paths.map(src).join(', ');

/** Every repository path cited with src(), for the test that checks each one exists. */
export const sourcePaths = (text: string): string[] => [...text.matchAll(new RegExp(`${REPO_URL.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/blob/main/([^)\\s]+)`, 'g'))].map((m) => m[1]!);
