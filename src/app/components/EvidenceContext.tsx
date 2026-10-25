/**
 * Evidence in context: the turns around an insight's grounded quote, with the matched
 * span highlighted. Reads GET /runs/:runId; when the run is not retained (seed history)
 * it falls back to the quote alone and says so.
 */
import type { Insight, Turn } from '../../shared/contracts';
import { api } from '../api/client';
import { keys, useQuery } from '../api/hooks';
import { Skeleton } from '../../uis/Skeleton';
import styles from './EvidenceContext.module.css';

function findTurnIndex(turns: Turn[], text: string | null, turnId: string | null): number {
  if (text) {
    const t = text.toLowerCase();
    const i = turns.findIndex((x) => x.text.toLowerCase().includes(t));
    if (i >= 0) return i;
  }
  if (turnId) return turns.findIndex((x) => x.id === turnId);
  return -1;
}

function Highlighted({ text, span }: { text: string; span: string | null }) {
  if (!span) return <>{text}</>;
  const i = text.toLowerCase().indexOf(span.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className={styles.mark}>{text.slice(i, i + span.length)}</mark>
      {text.slice(i + span.length)}
    </>
  );
}

export function EvidenceContext({ insight, radius = 2 }: { insight: Insight; radius?: number }) {
  const ev = insight.evidence.find((e) => e.method !== 'failed') ?? insight.evidence[0];
  const run = useQuery(insight.runId ? keys.run(insight.runId) : null, () => api.run(insight.runId), { staleMs: 60_000 });
  const span = ev?.matchedText ?? ev?.quote ?? null;
  const turns = run.data?.turns ?? [];
  const idx = turns.length ? findTurnIndex(turns, span, ev?.turnId ?? null) : -1;

  if (run.loading) {
    return (
      <div className={styles.wrap} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.turn}>
            <Skeleton width={110} height={10} />
            <Skeleton width={i === 1 ? '92%' : '70%'} height={12} />
          </div>
        ))}
      </div>
    );
  }

  if (idx < 0) {
    return (
      <div className={styles.wrap}>
        <blockquote className="sl-quote">{span ?? 'No quote recorded.'}</blockquote>
        <p className={styles.note}>
          {run.error
            ? 'The source transcript for this insight is not retained in this workspace, so only the grounded quote is shown.'
            : 'The quote could not be placed in a specific turn; showing it on its own.'}
        </p>
      </div>
    );
  }

  const from = Math.max(0, idx - radius);
  const to = Math.min(turns.length, idx + radius + 1);
  return (
    <ol className={styles.wrap} aria-label="Surrounding turns">
      {from > 0 ? <li className={styles.more}>… {from} earlier turn{from === 1 ? '' : 's'}</li> : null}
      {turns.slice(from, to).map((t, i) => {
        const hit = from + i === idx;
        return (
          <li key={t.id} className={`${styles.turn} ${hit ? styles.hit : ''}`} data-role={t.role}>
            <div className={styles.who}>
              <span className={styles.speaker}>{t.speaker}</span>
              {t.ts ? <span className={styles.ts}>{t.ts}</span> : null}
              <span className={styles.tid}>{t.id}</span>
            </div>
            <p className={styles.text}>{hit ? <Highlighted text={t.text} span={span} /> : t.text}</p>
          </li>
        );
      })}
      {to < turns.length ? <li className={styles.more}>… {turns.length - to} later turn{turns.length - to === 1 ? '' : 's'}</li> : null}
    </ol>
  );
}
