/**
 * An ordered, coalescing D1 write queue for one run. Pipeline steps push statements and keep going;
 * the queue sends whatever has accumulated as one `db.batch()` (one round trip, one transaction)
 * while the next step computes. Order is preserved: statements go out in push order, one batch at a
 * time. That removes per-statement round trips between steps.
 *
 * Liveness (guardLive): every batch starts with a guard statement that fails unless the run is
 * still live, inside the same transaction as the writes. A batch for a run a replay has taken over
 * therefore commits nothing (no check-then-write race, no extra round trip). On a failed batch the
 * queue reads the run's mode once: not live → pending writes are dropped and `superseded` flips,
 * which the pipeline's step wrapper turns into RunSuperseded at the next step boundary. The spend
 * ledger (ai_calls) never goes through this queue: see deps.ts Ledger.
 *
 * Durability: callers `drain()` where a write must be committed before moving on (end of a Workflow
 * step, before the final run patch).
 */
/**
 * A statement that errors (aborting its batch transaction) unless the run is live: json() of a
 * non-JSON string raises "malformed JSON". SQLite has no RAISE outside triggers.
 */
export function liveGuard(db: D1Database, runId: string): D1PreparedStatement {
  return db.prepare("SELECT json(CASE WHEN EXISTS (SELECT 1 FROM runs WHERE id = ? AND mode = 'live') THEN '1' ELSE 'run is no longer live' END) AS live").bind(runId);
}

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
          await this.db.batch(this.opts.guardLive ? [liveGuard(this.db, this.runId), ...chunk] : chunk);
          this.batches++;
        } catch (err) {
          if (this.opts.guardLive && !(await this.stillLive())) {
            this.superseded = true;
            this.pending = [];
            break;
          }
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

  private async stillLive(): Promise<boolean> {
    try {
      const r = await this.db.prepare('SELECT mode FROM runs WHERE id = ?').bind(this.runId).first<{ mode: string }>();
      return !!r && r.mode === 'live';
    } catch {
      return true; // unknown: report the batch failure instead of silently dropping writes
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
