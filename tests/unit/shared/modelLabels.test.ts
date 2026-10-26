import { describe, expect, it } from 'vitest';
import { modelLabel, relabelModelsDeep, rewriteModelIds } from '../../../src/shared/modelLabels';

describe('modelLabels', () => {
  it('labels the configured models by tier', () => {
    const cfg = { primary: 'acme/fast-1', secondary: 'acme/judge-2' };
    expect(modelLabel('acme/fast-1', cfg)).toBe('Main model');
    expect(modelLabel('acme/judge-2', cfg)).toBe('Backup model');
  });

  it('labels the decision model as its own role', () => {
    expect(modelLabel('acme/quick-0', { primary: 'acme/fast-1', secondary: 'acme/judge-2', decision: 'acme/quick-0' })).toBe('Decision model');
    expect(modelLabel('z-ai/glm-5.3-flash')).toBe('Decision model');
    expect(rewriteModelIds('screen via z-ai/glm-5.3-flash (412ms)')).toBe('screen via Decision model (412ms)');
  });

  it('falls back to the known deployment and simulated-agent ids', () => {
    expect(modelLabel('deepseek/deepseek-v4.1-flash')).toBe('Main model');
    expect(modelLabel('anthropic/claude-haiku-5.5')).toBe('Backup model');
    expect(modelLabel('anthropic/claude-sonnet-5.5')).toBe('Primary model');
    expect(modelLabel('openai/gpt-5.4-mini')).toBe('Secondary model');
    expect(modelLabel('unknown')).toBe('Other model');
    expect(modelLabel(null)).toBeNull();
  });

  it('rewrites ids inside free text and nested attrs', () => {
    expect(rewriteModelIds('screen via deepseek/deepseek-v4.1-flash (812ms)')).toBe('screen via Main model (812ms)');
    expect(rewriteModelIds('ai.generate google/gemini-3-pro')).toBe('ai.generate Other model');
    expect(rewriteModelIds('GET /ops/logs?runId=1')).toBe('GET /ops/logs?runId=1');
    expect(relabelModelsDeep({ model: 'anthropic/claude-haiku-5.5', n: 2, xs: ['openai/gpt-5.4-mini'] })).toEqual({
      model: 'Backup model',
      n: 2,
      xs: ['Secondary model'],
    });
  });
});
