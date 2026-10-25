/**
 * An ordered, coalescing D1 write queue for one run. Pipeline steps push statements and keep
 * going; the queue sends whatever has accumulated as one `db.batch()` (one round trip, one
 * transaction) while the next step computes. Order is preserved: statements go out in push
 * order, one batch at a time. That removes the per-statement round trips that used to sit
 * between steps.
 *
 * Liveness: before each batch the queue checks that the run is still live. When a replay
 * fallback has taken the run over, pending writes are dropped and `superseded` flips, which
 * the pipeline's step wrapper turns into RunSuperseded at the next step boundary.
 *
 * Durability: callers `drain()` where a write must be committed before moving on (end of a
 * Workflow step, before the final run patch).
 */
export class WriteQueue {
  private pending: D1PreparedStatement[] = [];
  private background: Promise<unknown>[] = [];
  private inflight: Promise<void> | null = null;
  private failure: unknown = null;
  superseded = false;
  batches = 0;

  private readonly db: D1Database;
  private readonly runId: string;
  private readonly opts: { guardLive?: boolean; maxBatch?: number };

  constructor(db: D1Database, runId: string, opts: { guardLive?: boolean; maxBatch?: number } = {}) {
    this.db = db;
    this.runId = runId;
    this.opts = opts;
  }

  push(...stmts: (D1PreparedStatement | null | undefined)[]): void {
    if (this.superseded) return;
    for (const s of stmts) if (s) this.pending.push(s);
    if (this.pending.length && !this.inflight) this.inflight = this.loop();
  }

  /** Track a side effect that is not a D1 statement (e.g. a Vectorize upsert). */
  track(p: Promise<unknown>): void {
    this.background.push(p.catch((err) => console.warn(JSON.stringify({ level: 'warn', event: 'write_queue.side_effect_failed', run: this.runId, msg: String(err).slice(0, 200) }))));
  }

  private async loop(): Promise<void> {
    try {
      while (this.pending.length && !this.superseded) {
        const chunk = this.pending.splice(0, this.opts.maxBatch ?? 60);
        try {
          if (this.opts.guardLive) {
            const r = await this.db.prepare('SELECT mode FROM runs WHERE id = ?').bind(this.runId).first<{ mode: string }>();
            if (!r || r.mode !== 'live') {
              this.superseded = true;
              this.pending = [];
              break;
            }
          }
          await this.db.batch(chunk);
          this.batches++;
        } catch (err) {
          this.failure ??= err;
          console.error(JSON.stringify({ level: 'error', event: 'write_queue.batch_failed', run: this.runId, statements: chunk.length, msg: String(err).slice(0, 300) }));
        }
      }
    } finally {
      this.inflight = null;
      // Statements pushed while the last batch was finishing.
      if (this.pending.length && !this.superseded) this.inflight = this.loop();
    }
  }

  /** Wait until everything pushed so far is committed. Throws the first batch failure. */
  async drain(): Promise<void> {
    while (this.inflight) await this.inflight;
    if (this.background.length) await Promise.all(this.background.splice(0));
    if (this.failure) {
      const err = this.failure;
      this.failure = null;
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}
