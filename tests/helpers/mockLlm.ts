/** In-process LlmClient backed by the deterministic mock model (unit tests, offline scripts). */
import type { LlmClient, LlmMeta, LlmRequest } from '../../src/pipeline/types.ts';
import { LlmFailure } from '../../src/pipeline/types.ts';
import { mockRespond } from './mockModel.ts';

export function mockLlm(opts: { failPurposes?: string[]; model?: string } = {}): LlmClient & { calls: { purpose: string; prompt: string; system: string }[] } {
  const calls: { purpose: string; prompt: string; system: string }[] = [];
  return {
    calls,
    async structured<T>(req: LlmRequest<T>): Promise<{ data: T; meta: LlmMeta }> {
      calls.push({ purpose: req.purpose, prompt: req.prompt, system: req.system });
      const meta: LlmMeta = { model: opts.model ?? 'mock/primary', tokensIn: Math.ceil((req.system.length + req.prompt.length) / 4), tokensOut: 120, costUsd: 0.0003, ms: 5, attempts: 1, fellBack: false, schemaRetried: false, errors: [] };
      if (opts.failPurposes?.includes(req.purpose)) throw new LlmFailure(`${req.purpose} failed on both models: mock outage`, { ...meta, attempts: 3, fellBack: true, errors: ['mock outage'] });
      const raw = mockRespond(req.schemaName, req.prompt);
      const parsed = req.schema.parse(req.repair ? req.repair(raw) : raw);
      return { data: parsed, meta };
    },
  };
}
