/** Eval judge prompt (secondary model, a different family from the primary). */
import { z } from 'zod';

export const JUDGE_SYSTEM = `You are an impartial evaluator. You get one ground-truth insight from a labelled customer call and up to five candidate insights a system extracted from the same call. Decide which candidate, if any, describes the SAME underlying customer issue (same problem or request, same product area; wording may differ). A candidate about a different issue, or one that is far more generic, is not a match. Return only JSON: {"match_index": <0-based index or null>, "reason": "<at most 20 words>"}.`;

export const JudgeOutput = z.object({ match_index: z.number().int().nullable(), reason: z.string().max(400) });
export type JudgeOutput = z.infer<typeof JudgeOutput>;

export const JUDGE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['match_index', 'reason'],
  properties: { match_index: { type: ['integer', 'null'] }, reason: { type: 'string' } },
} as const;

export function judgePrompt(golden: { type: string; productArea: string; summary: string; quote: string }, candidates: { type: string; productArea: string; summary: string; quote: string }[]): string {
  return [
    `Ground truth: [${golden.type} · ${golden.productArea}] ${golden.summary}\nQuote: "${golden.quote}"`,
    '',
    'Candidates:',
    ...candidates.map((c, i) => `${i}. [${c.type} · ${c.productArea}] ${c.summary}\n   Quote: "${c.quote}"`),
  ].join('\n');
}
