/**
 * Embeddings for scripts: Workers AI @cf/baai/bge-base-en-v1.5 over the Cloudflare REST API
 * (same model the Worker uses), with the deterministic hash embedding as an explicit fallback.
 */
import { hashEmbed } from '../../src/pipeline/theme.ts';

export const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

export type Embedder = (texts: string[]) => Promise<{ vectors: number[][]; model: string }>;

export function cloudflareEmbedder(env: Record<string, string>, opts: { allowFallback?: boolean } = {}): Embedder {
  const account = env.CLOUDFLARE_WRITE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_WRITE_API_KEY;
  return async (texts) => {
    if (!account || !token) {
      if (opts.allowFallback) return { vectors: texts.map((t) => hashEmbed(t)), model: 'hash-768 (fallback)' };
      throw new Error('CLOUDFLARE_WRITE_ACCOUNT_ID / CLOUDFLARE_WRITE_API_KEY missing for embeddings');
    }
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += 50) {
      const chunk = texts.slice(i, i + 50);
      let lastErr = '';
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${EMBED_MODEL}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ text: chunk }),
        });
        if (res.ok) {
          const body = (await res.json()) as { result?: { data?: number[][] } };
          const data = body.result?.data;
          if (data?.length === chunk.length) {
            vectors.push(...data);
            lastErr = '';
            break;
          }
          lastErr = 'malformed embedding response';
        } else {
          lastErr = `HTTP ${res.status}`;
        }
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
      if (lastErr) {
        if (opts.allowFallback) return { vectors: texts.map((t) => hashEmbed(t)), model: 'hash-768 (fallback)' };
        throw new Error(`embedding failed: ${lastErr}`);
      }
    }
    return { vectors, model: EMBED_MODEL };
  };
}
