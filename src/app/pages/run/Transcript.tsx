/**
 * The transcript pane: turns with speaker chips and timestamps, redaction tokens as pills,
 * and evidence spans highlighted as insights ground. A Before/After toggle swaps tokens for
 * the server's MASKED previews (originals never reach the browser). Clicking a highlight
 * selects its insight; selecting an insight scrolls here and flashes its span.
 */
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Redaction, Turn } from '../../../shared/contracts';
import { emit } from '../../../shared/events';
import { tourAnchor } from '../../../tour/anchors';
import { SegmentedControl } from '../../../uis/SegmentedControl';
import { IconLock } from '../../components/icons';
import styles from './Transcript.module.css';

export type Highlight = {
  insightId: string;
  turnId: string | null;
  start: number | null;
  end: number | null;
  text: string | null;
  kind: 'grounded' | 'fuzzy' | 'dropped';
  label: string;
};

type Range = { from: number; to: number; h: Highlight };

const TOKEN_RE = /\[([A-Z]+)_(\d+)\]/g;

function findRange(turn: Turn, h: Highlight): Range | null {
  const t = turn.text;
  if (h.text) {
    let i = t.indexOf(h.text);
    if (i < 0) i = t.toLowerCase().indexOf(h.text.toLowerCase());
    if (i >= 0) return { from: i, to: i + h.text.length, h };
  }
  if (h.start != null && h.end != null && h.start >= turn.start && h.start < turn.end) {
    const from = h.start - turn.start;
    return { from, to: Math.min(t.length, h.end - turn.start), h };
  }
  return null;
}

function renderTokens(text: string, mode: 'after' | 'before', previews: Map<string, Redaction>, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const r = previews.get(token);
    out.push(
      mode === 'after' ? (
        <span key={`${keyBase}-${m.index}`} className={styles.token} title={`${r?.kind ?? 'value'} redacted before any model call`}>
          <IconLock size={10} />
          {token.slice(1, -1)}
        </span>
      ) : (
        <span key={`${keyBase}-${m.index}`} className={styles.masked} title={`Masked preview of ${token}. The original never leaves the server.`}>
          {r?.preview ?? '•••'}
        </span>
      ),
    );
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Transcript({
  turns,
  redactions,
  highlights,
  mode,
  onModeChange,
  focus,
  onSelectInsight,
  pending,
  pendingLabel,
}: {
  turns: Turn[];
  redactions: Redaction[];
  highlights: Highlight[];
  mode: 'after' | 'before';
  onModeChange: (m: 'after' | 'before') => void;
  focus: { insightId: string; n: number } | null;
  onSelectInsight: (insightId: string) => void;
  pending: boolean;
  pendingLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previews = useMemo(() => new Map(redactions.map((r) => [r.token, r])), [redactions]);
  const redactionCount = redactions.reduce((a, r) => a + r.count, 0);

  const rangesByTurn = useMemo(() => {
    const map = new Map<string, Range[]>();
    for (const h of highlights) {
      const candidates = h.turnId ? turns.filter((t) => t.id === h.turnId) : [];
      const pool = candidates.length ? candidates : turns;
      for (const t of pool) {
        const r = findRange(t, h);
        if (r) {
          const list = map.get(t.id) ?? [];
          if (!list.some((x) => x.from < r.to && r.from < x.to)) list.push(r);
          map.set(t.id, list.sort((a, b) => a.from - b.from));
          break;
        }
      }
    }
    return map;
  }, [highlights, turns]);

  useEffect(() => {
    if (!focus) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-ev="${focus.insightId}"]`);
    if (!el || !scrollRef.current) return;
    const box = scrollRef.current;
    const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.remove(styles.flash!);
    void el.offsetWidth;
    el.classList.add(styles.flash!);
  }, [focus]);

  return (
    <section className={styles.pane} aria-label="Transcript" {...tourAnchor('run.transcript')}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>Transcript</h2>
          <p className={styles.sub}>
            {pending ? pendingLabel : `${turns.length} turns · ${redactionCount} value${redactionCount === 1 ? '' : 's'} redacted · ${highlights.filter((h) => h.kind !== 'dropped').length} evidence span${highlights.filter((h) => h.kind !== 'dropped').length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div {...tourAnchor('run.redaction')} className={styles.toggle}>
          <SegmentedControl<'after' | 'before'>
            ariaLabel="Redaction view"
            size="sm"
            value={mode}
            onChange={(v) => {
              onModeChange(v);
              emit({ name: 'redaction.toggled', showing: v });
            }}
            disabled={pending || redactionCount === 0}
            options={[
              { value: 'after', label: 'What the model saw', title: 'Redacted text: tokens like [PHONE_1] replace personal data' },
              { value: 'before', label: 'Before (masked)', title: 'Masked previews of the original values; originals never leave the server' },
            ]}
          />
        </div>
      </header>
      {redactionCount > 0 && !pending ? (
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.swatchEv} /> grounded quote
          </span>
          <span className={styles.legendItem}>
            <span className={styles.swatchDrop} /> best match for a dropped quote
          </span>
          <span className={styles.legendItem}>
            {mode === 'after' ? (
              <span className={styles.token}>
                <IconLock size={10} />
                TOKEN
              </span>
            ) : (
              <span className={styles.masked}>J••• M•••</span>
            )}{' '}
            {mode === 'after' ? 'redacted value' : 'masked original'}
          </span>
        </div>
      ) : null}
      <div ref={scrollRef} className={styles.scroll} tabIndex={0} aria-label="Transcript turns">
        {pending ? (
          <div className={styles.skel} aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className={styles.skelTurn}>
                <span className={styles.skelChip} />
                <span className={styles.skelLine} style={{ width: `${88 - ((i * 23) % 35)}%` }} />
                {i % 2 === 0 ? <span className={styles.skelLine} style={{ width: `${55 - ((i * 13) % 20)}%` }} /> : null}
              </div>
            ))}
          </div>
        ) : turns.length === 0 ? (
          <p className={styles.empty}>No turns were parsed from this file.</p>
        ) : (
          <ol className={styles.turns}>
            {turns.map((t) => {
              const ranges = rangesByTurn.get(t.id) ?? [];
              const parts: ReactNode[] = [];
              let cur = 0;
              ranges.forEach((r, i) => {
                if (r.from > cur) parts.push(<Fragment key={`p${i}`}>{renderTokens(t.text.slice(cur, r.from), mode, previews, `${t.id}-a${i}`)}</Fragment>);
                parts.push(
                  <mark
                    key={`m${i}`}
                    data-ev={r.h.insightId}
                    className={`${styles.mark} ${styles[`mark_${r.h.kind}`] ?? ''}`}
                    onClick={() => onSelectInsight(r.h.insightId)}
                    title={r.h.label}
                  >
                    {renderTokens(t.text.slice(r.from, r.to), mode, previews, `${t.id}-m${i}`)}
                  </mark>,
                );
                cur = r.to;
              });
              if (cur < t.text.length) parts.push(<Fragment key="tail">{renderTokens(t.text.slice(cur), mode, previews, `${t.id}-t`)}</Fragment>);
              return (
                <li key={t.id} className={`${styles.turn} ${styles[`role_${t.role}`] ?? ''}`}>
                  <div className={styles.turnHead}>
                    <span className={styles.speaker}>{t.speaker}</span>
                    {t.ts ? <time className={styles.ts}>{t.ts}</time> : null}
                    <span className={styles.tid}>{t.id}</span>
                  </div>
                  <p className={styles.text}>{parts}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
