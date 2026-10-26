/**
 * Evidence in context: the customer's words (the `Quote` treatment, matched span marked) inside
 * a few surrounding lines of the conversation. Reads GET /runs/:runId; when the conversation is
 * not stored (older sample history) it shows the verified quote on its own and says so.
 */
import type { Insight, Turn } from '../../shared/contracts';
import { Quote, Skeleton } from '../../ds';
import { api } from '../api/client';
import { keys, useQuery } from '../api/hooks';
import { RedactedText, redactedPlain } from '../pages/run/Transcript';
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
  if (!span) return <RedactedText text={text} />;
  const i = text.toLowerCase().indexOf(span.toLowerCase());
  if (i < 0) return <RedactedText text={text} />;
  return (
    <>
      <RedactedText text={text.slice(0, i)} />
      <mark className={styles.mark}>
        <RedactedText text={text.slice(i, i + span.length)} />
      </mark>
      <RedactedText text={text.slice(i + span.length)} />
    </>
  );
}

function Speaker({ turn }: { turn: Turn }) {
  return (
    <span className={styles.who}>
      <span className={styles.speaker}>{redactedPlain(turn.speaker)}</span>
      {turn.ts ? <span className={styles.ts}>{turn.ts}</span> : null}
    </span>
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
      <div className={styles.wrap} aria-busy="true" aria-label="Loading the conversation">
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skelLine}>
            <Skeleton width={96} height={10} />
            <Skeleton width={i === 1 ? '92%' : '70%'} height={12} />
          </div>
        ))}
      </div>
    );
  }

  if (idx < 0) {
    return (
      <div className={styles.wrap}>
        <Quote>{span ? <RedactedText text={span} /> : 'No quote recorded.'}</Quote>
        <p className={styles.note}>
          {run.error ? 'The full conversation isn’t stored for this older insight, so only the verified quote is shown.' : 'Shown on its own: the quote spans more than one line of the conversation.'}
        </p>
      </div>
    );
  }

  const from = Math.max(0, idx - radius);
  const to = Math.min(turns.length, idx + radius + 1);
  const hit = turns[idx]!;
  return (
    <div className={styles.wrap} role="list" aria-label="The quote in the conversation">
      {turns.slice(from, idx).map((t) => (
        <div key={t.id} role="listitem" className={styles.line}>
          <Speaker turn={t} />
          <p className={styles.text}>
            <RedactedText text={t.text} />
          </p>
        </div>
      ))}
      <div role="listitem" className={styles.hit}>
        <Quote
          cite={
            <>
              {redactedPlain(hit.speaker)}
              {hit.ts ? `, ${hit.ts}` : ''}
            </>
          }
        >
          <Highlighted text={hit.text} span={span} />
        </Quote>
      </div>
      {turns.slice(idx + 1, to).map((t) => (
        <div key={t.id} role="listitem" className={styles.line}>
          <Speaker turn={t} />
          <p className={styles.text}>
            <RedactedText text={t.text} />
          </p>
        </div>
      ))}
    </div>
  );
}
