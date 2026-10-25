/**
 * Run-view wording for model roles: "Main model" / "Backup model" instead of the shared tier
 * labels ("Primary · fast tier", "Secondary · fallback & judge"). Exact ids stay on Settings.
 */
export function friendlyModel(text: string | null | undefined): string | null {
  if (text == null) return null;
  return text
    .replace(/Primary\s*·\s*fast tier/g, 'Main model')
    .replace(/Secondary\s*·\s*fallback\s*&\s*judge/g, 'Backup model')
    .replace(/\bfast tier\b/g, 'main model')
    .replace(/\bfallback\s*&\s*judge\b/g, 'backup model');
}

/** Step summaries are written for engineers; drop hashes from the surface (kept on Agent Ops). */
export function plainSummary(text: string | null | undefined): string | null {
  if (text == null) return null;
  return text
    .replace(/\s*·\s*SHA-256\s+[0-9a-f…]+\.*/gi, '')
    .replace(/\bSHA-256\s+[0-9a-f…]+\.*/gi, 'file fingerprint')
    .trim();
}
