/**
 * The transcript card: readable turns (speaker, time, text), hidden personal details as subtle
 * inline chips, and the customer quotes behind each insight highlighted once they are checked.
 * A Before/After toggle swaps the placeholders for the server's partly hidden previews (the
 * originals never reach the browser). Clicking a highlight selects its insight; selecting an
 * insight scrolls here and highlights its quote. Long transcripts scroll inside the card.
 */
import { Fragment, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Redaction, Turn } from '../../../shared/contracts';
import { emit } from '../../../shared/events';
import { tourAnchor } from '../../../tour/anchors';
import { Card, cx, Segmented, Skeleton } from '../../../ds';
import { IconLock } from '../../../ds/icons';
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

const TOKEN_WORD: Record<string, string> = {
  PERSON: 'Person',
  PHONE: 'Phone',
  EMAIL: 'Email',
  CARD: 'Card',
  SSN: 'SSN',
  DOB: 'Date of birth',
  PATIENT: 'Patient',
  MRN: 'Record number',
  ADDRESS: 'Address',
};

const KIND_WORD: Record<string, string> = {
  person: 'name',
  phone: 'phone number',
  email: 'email address',
  card: 'card number',
  ssn: 'social security number',
  dob: 'date of birth',
  patient: 'patient name',
  mrn: 'medical record number',
  address: 'address',
};

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
    const what = KIND_WORD[r?.kind ?? m[1]!.toLowerCase()] ?? 'personal detail';
    out.push(
      mode === 'after' ? (
        <span key={`${keyBase}-${m.index}`} className={styles.token} title={`A ${what} was replaced with this placeholder before any AI saw the text`}>
          <IconLock size={10} />
          {`${TOKEN_WORD[m[1]!] ?? m[1]!.charAt(0) + m[1]!.slice(1).toLowerCase()} ${m[2]}`}
        </span>
      ) : (
        <span key={`${keyBase}-${m.index}`} className={styles.masked} title={`The original ${what}, partly hidden. The full value never leaves the server.`}>
          {r?.preview ?? '•••'}
        </span>
      ),
    );
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const MARK_CLASS: Record<Highlight['kind'], string | undefined> = {
  grounded: styles.markQuote,
  fuzzy: styles.markQuote,
  dropped: styles.markDropped,
};

/** Text that may hold redaction placeholders ([PERSON_1]): shows them as the same quiet chips as the transcript. */
export function RedactedText({ text }: { text: string }) {
  return <>{renderTokens(text, 'after', new Map(), 'rt')}</>;
}

/** Plain-text form for labels and tooltips: "[PERSON_1]" becomes "Person 1". */
export function redactedPlain(text: string): string {
  return text.replace(TOKEN_RE, (_m, kind: string, n: string) => `${TOKEN_WORD[kind] ?? kind.charAt(0) + kind.slice(1).toLowerCase()} ${n}`);
}

export function Transcript({
  turns,
  redactions,
  highlights,
  mode,
  onModeChange,
  focus,
  activeInsight,
  onSelectInsight,
  pending,
  pendingLabel,
  emptyLabel,
}: {
  turns: Turn[];
  redactions: Redaction[];
  highlights: Highlight[];
  mode: 'after' | 'before';
  onModeChange: (m: 'after' | 'before') => void;
  focus: { insightId: string; n: number } | null;
  activeInsight: string | null;
  onSelectInsight: (insightId: string) => void;
  pending: boolean;
  pendingLabel: string;
  emptyLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const previews = useMemo(() => new Map(redactions.map((r) => [r.token, r])), [redactions]);
  const redactionCount = redactions.reduce((a, r) => a + r.count, 0);
  const quoteCount = highlights.filter((h) => h.kind !== 'dropped').length;
  const hasDropped = highlights.some((h) => h.kind === 'dropped');

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
          map.set(
            t.id,
            list.sort((a, b) => a.from - b.from),
          );
          break;
        }
      }
    }
    return map;
  }, [highlights, turns]);

  // Selecting an insight: scroll its quote to the middle of the transcript and highlight it.
  useEffect(() => {
    if (!focus) return;
    const box = scrollRef.current;
    const el = box?.querySelector<HTMLElement>(`[data-ev="${focus.insightId}"]`);
    if (!el || !box) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
    box.scrollTo({
      top: Math.max(0, top),
      behavior: smooth ? 'smooth' : 'auto',
    });
    // In one column the transcript sits above the insights: bring it into view.
    const card = cardRef.current?.getBoundingClientRect();
    if (card && (card.bottom < 80 || card.top > window.innerHeight - 80))
      cardRef.current?.scrollIntoView({
        block: 'start',
        behavior: smooth ? 'smooth' : 'auto',
      });
    el.classList.remove(styles.flash!);
    void el.offsetWidth;
    el.classList.add(styles.flash!);
  }, [focus]);

  const empty = !pending && turns.length === 0;
  const description = pending
    ? pendingLabel
    : empty
      ? 'Nothing to show'
      : `${turns.length} line${turns.length === 1 ? '' : 's'}, ${redactionCount} personal detail${redactionCount === 1 ? '' : 's'} hidden, ${quoteCount} quote${quoteCount === 1 ? '' : 's'} found`;

  return (
    <div ref={cardRef} className={styles.anchor}>
      <Card title="Transcript" description={description} flush className={styles.card} bodyClassName={styles.body} attrs={{ ...tourAnchor('run.transcript'), 'aria-label': 'Transcript' }}>
        {empty ? null : (
          <div className={styles.toolbar}>
            <div className={styles.legend} aria-label="Key">
              <span className={styles.legendItem}>
                <span className={cx(styles.swatch, styles.swatchQuote)} aria-hidden="true" />
                Customer quote
              </span>
              {hasDropped ? (
                <span className={styles.legendItem}>
                  <span className={cx(styles.swatch, styles.swatchDropped)} aria-hidden="true" />
                  Closest to a dropped quote
                </span>
              ) : null}
            </div>
            <div className={cx(styles.toggle, (pending || redactionCount === 0) && styles.toggleIdle)} {...tourAnchor('run.redaction')}>
              <span className={styles.toggleLabel}>Redaction</span>
              {redactionCount === 0 && !pending ? (
                <span className={styles.toggleNone}>Nothing to hide</span>
              ) : (
                <Segmented<'before' | 'after'>
                  label="Redaction view"
                  size="sm"
                  value={mode}
                  onChange={(v) => {
                    if (pending) return;
                    onModeChange(v);
                    emit({ name: 'redaction.toggled', showing: v });
                  }}
                  options={[
                    {
                      value: 'before',
                      label: 'Before',
                      attrs: {
                        title: 'Partly hidden previews of the original values. The originals never leave the server.',
                      },
                    },
                    {
                      value: 'after',
                      label: 'After',
                      attrs: {
                        title: 'What the AI saw: placeholders instead of personal details',
                      },
                    },
                  ]}
                />
              )}
            </div>
          </div>
        )}
        <div ref={scrollRef} className={styles.scroll} tabIndex={0} aria-label="Transcript lines">
          {pending ? (
            <div className={styles.skeleton} aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className={styles.skeletonTurn}>
                  <Skeleton width={i % 2 ? 88 : 112} height={10} />
                  <Skeleton width={`${92 - ((i * 23) % 30)}%`} height={10} />
                  {i % 3 !== 1 ? <Skeleton width={`${58 - ((i * 13) % 20)}%`} height={10} /> : null}
                </div>
              ))}
            </div>
          ) : turns.length === 0 ? (
            <p className={styles.empty}>{emptyLabel}</p>
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
                      className={cx(styles.mark, MARK_CLASS[r.h.kind], activeInsight === r.h.insightId && styles.markActive)}
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
                  <li key={t.id} className={styles.turn}>
                    <div className={styles.turnHead}>
                      <span className={cx(styles.speaker, t.role === 'customer' ? styles.speakerCustomer : styles.speakerTeam)}>
                        {t.speaker.trim().toLowerCase() === 'unknown' ? 'Unknown speaker' : renderTokens(t.speaker, mode, previews, `${t.id}-s`)}
                      </span>
                      {t.ts ? <time className={styles.ts}>{t.ts}</time> : null}
                    </div>
                    <p className={styles.text}>{parts}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}
