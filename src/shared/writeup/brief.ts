/**
 * The four things the brief asks about, answered plainly near the top of the write-up's index:
 * a heading in the brief's words, two or three sentences, and the pages that go deeper. No
 * "question N" labels on the page.
 */
export type BriefQuestion = {
  n: 1 | 2 | 3 | 4;
  /** A plain heading in the brief's words. */
  title: string;
  /** Two or three short sentences. */
  answer: string;
  /** Chapter ids (src/shared/writeup/chapters.ts) that answer it in depth. */
  chapters: string[];
  /** Q&A topics (src/shared/writeup/questions.ts) that go deeper. */
  topics: string[];
};

export const BRIEF: BriefQuestion[] = [
  {
    n: 1,
    title: 'Process design: jobs to be done, today and tomorrow',
    answer: 'Four people need what customers tell CSMs: the CSM, the PM, the VP Product, and sales, competitive and support leads. Today it depends on memory and retyping, and I assume about 40 of 100 pieces reach an owner. In the future state every call is read, each insight carries the customer’s own words, and the owner has it within a business day.',
    chapters: ['signal', 'jobs'],
    topics: ['metrics'],
  },
  {
    n: 2,
    title: 'The build: how it works',
    answer: 'A working proof of concept, built in 48 hours: a ten-step pipeline on one Cloudflare Worker, with three model roles. The model proposes, code checks every quote, and a rules table decides who hears what. Failures retry, fall back or wait for a person, and tests gate every prompt change.',
    chapters: ['built', 'call', 'operate'],
    topics: ['failure', 'security'],
  },
  {
    n: 3,
    title: 'Rollout and trust',
    answer: 'Shadow mode first, then two or three champions, then the whole team. It takes the data entry, not the judgement: CSMs get the credit, and it drafts notes to customers but never sends them. Trust comes from checked quotes, people deciding anything uncertain, and adoption measured from real use.',
    chapters: ['trust'],
    topics: ['metrics', 'agent-ops'],
  },
  {
    n: 4,
    title: 'The next 12–18 months',
    answer: 'Cheaper, faster models make it affordable to read every call, then to catch signals during the call. Specialist agents will check each other’s work, and more analyses will run on the same platform. The production design keeps the same boundaries on a stack built for scale.',
    chapters: ['future'],
    topics: ['build-vs-buy', 'differently'],
  },
];

export const briefQuestion = (n: number): BriefQuestion | undefined => BRIEF.find((q) => q.n === n);
