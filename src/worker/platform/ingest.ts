import { IngestBatch } from '../../shared/platform-contracts';
import type { Env } from '../env';

/** Validate and store an agent's telemetry in the platform DB (implemented by the platform builder). */
export async function ingest(env: Env, batch: unknown): Promise<void> {
  const parsed = IngestBatch.parse(batch);
  void env;
  void parsed;
}
