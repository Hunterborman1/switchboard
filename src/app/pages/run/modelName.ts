/**
 * Step summaries are written for engineers; drop file hashes from the surface (they stay on
 * Agent Ops). Model ids are relabelled by the shared helper (src/shared/modelLabels.ts).
 */
export function plainSummary(text: string | null | undefined): string | null {
  if (text == null) return null;
  return text
    .replace(/\s*·\s*SHA-256\s+[0-9a-f…]+\.*/gi, '')
    .replace(/\bSHA-256\s+[0-9a-f…]+\.*/gi, 'file fingerprint')
    .trim();
}
