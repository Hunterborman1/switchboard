/** In-memory PipelineStore for Node scripts (seed/backfill/replays/evals) and unit tests. */
import type { Delivery, FileFormat, Insight, Notification, ScreenOutput } from '../../src/shared/contracts.ts';
import type { DlqRow, NewTheme, PipelineStore, RedactedDoc } from '../../src/pipeline/types.ts';

export type MemState = {
  raw: Map<string, { sha256: string; filename: string; content: string; sizeBytes: number }>;
  transcripts: Map<string, { doc: RedactedDoc; format: FileFormat }>;
  screens: Map<string, ScreenOutput>;
  insights: Map<string, Insight>;
  themes: Map<string, NewTheme>;
  deliveries: Map<string, Delivery>;
  notifications: Map<string, Notification>;
  runs: Map<string, Record<string, unknown>>;
  dlq: DlqRow[];
};

export function memState(): MemState {
  return { raw: new Map(), transcripts: new Map(), screens: new Map(), insights: new Map(), themes: new Map(), deliveries: new Map(), notifications: new Map(), runs: new Map(), dlq: [] };
}

export function memStore(s: MemState = memState()): PipelineStore & { state: MemState } {
  return {
    state: s,
    async saveRawFile(f) { s.raw.set(f.sha256, f); },
    async saveTranscript(runId, doc, format) { s.transcripts.set(runId, { doc, format }); },
    async saveScreen(runId, screen) { s.screens.set(runId, screen); },
    async saveInsights(list) { for (const i of list) s.insights.set(i.id, structuredClone(i)); },
    async createThemes(list) { for (const t of list) s.themes.set(t.id, t); },
    async saveDeliveries(list) { for (const d of list) s.deliveries.set(d.id, d); },
    async saveNotifications(list) { for (const n of list) s.notifications.set(n.id, n); },
    async updateRun(runId, patch) { s.runs.set(runId, { ...(s.runs.get(runId) ?? {}), ...patch }); },
    async recordDlq(row) { s.dlq.push(row); },
  };
}
