/**
 * The Q&A (/backup and /backup/:topic): one page per likely question, in the Q&A's own design.
 * A tab strip of topics (links, one page each), then the question's kicker, title, lede and
 * cards. The cost page reads its figures live from this deployment. Nothing waits for a click:
 * the page arrives with one short fade, and the gauge and bars fill once.
 *
 * Topics match BACKUPS in src/tour/script/chapters.ts, so the presenter view's Q&A buttons land
 * here. The prose lives in src/shared/writeup/questions.ts, which also renders each page's
 * Markdown (/backup/<topic>.md). An unknown topic is the site's not-found page.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Badge, Button, ButtonLink, Callout, Skeleton, TabLinks } from '../../../ds';
import { IconArrowLeft, IconArrowRight, IconDownload, IconFileText } from '../../../ds/icons';
import { SiteBar } from '../../../narrative/components';
import { useCalm } from '../../../narrative/hooks';
import { DUR, EASE } from '../../../narrative/motion';
import { tourApi } from '../../../tour/api';
import { BUDGET_LIMIT_USD } from '../../../shared/contracts';
import { QUESTION_PAGES, questionPage } from '../../../shared/writeup/questions';
import { INDEX_COPY, QUESTIONS_MD, questionMd, questionPath } from '../../../shared/writeup/site';
import type { Block, CardItem, CostBlock, FlowStep, QuestionPage as Question, TableRow } from '../../../shared/writeup/types';
import { NotFound } from '../../NotFound';
import { BASE, Rich, ZIP_HREF } from './Rich';
import './questions.css';

// ---------------------------------------------------------------- frame

function Frame({ topic, kicker, title, mdHref, children }: { topic: string | null; kicker: string; title: string; mdHref: string; children: ReactNode }) {
  const navigate = useNavigate();
  const back = () => {
    const st = window.history.state as { idx?: number } | null;
    if (st && typeof st.idx === 'number' && st.idx > 0) navigate(-1);
    else navigate('/');
  };
  // On a phone the tab strip scrolls sideways: bring this page's tab into view.
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nav = strip.current?.querySelector<HTMLElement>('.ds-tabs');
    const tab = nav?.querySelector<HTMLElement>('.is-active');
    if (nav && tab && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, tab.offsetLeft - nav.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2);
  }, [topic]);
  return (
    <main className="ds-app sl-n n-page bk-page" data-testid="backup-page" data-topic={topic ?? 'index'}>
      <SiteBar context="Questions">
        <Button variant="ghost" size="sm" icon={<IconArrowLeft size={16} />} onClick={back} data-testid="backup-back">
          Back
        </Button>
      </SiteBar>
      <div className="bk-switch">
        <div className="bk-switch__in" ref={strip}>
          <TabLinks label="Q&A topics" items={QUESTION_PAGES.map((q) => ({ to: questionPath(q.id), label: q.title }))} />
        </div>
      </div>
      <div className="bk-body">
        <header className="bk-head">
          <p className="bk-kicker">{kicker}</p>
          <h1 className="bk-title">{title}</h1>
          <span className="bk-meta">
            <a className="bk-meta__link" href={mdHref} data-testid="backup-md">
              <IconFileText size={14} />
              Markdown of this page
            </a>
            <a className="bk-meta__link" href={ZIP_HREF} download data-testid="backup-zip">
              <IconDownload size={14} />
              All pages as a .zip
            </a>
          </span>
        </header>
        {children}
      </div>
    </main>
  );
}

/** One short arrival per page: a fade and a 6px rise. Reduced motion shows it at once. */
function Arrive({ children }: { children: ReactNode }) {
  const calm = useCalm();
  return (
    <motion.div className="bk-content" initial={calm ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : DUR.layout, ease: EASE }}>
      {children}
    </motion.div>
  );
}

const usd = (n: number, d: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// ---------------------------------------------------------------- cost (live)

type CostData = { perCall: number | null; liveRuns: number; p50Ms: number | null; spent: number | null; limit: number; ok: boolean };

function useCostData(): CostData | null {
  const [d, setD] = useState<CostData | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: CostData = { perCall: null, liveRuns: 0, p50Ms: null, spent: null, limit: BUDGET_LIMIT_USD, ok: false };
      try {
        const runs = await tourApi.runs(200);
        const live = runs.filter((r) => r.mode === 'live' && r.costUsd > 0);
        out.liveRuns = live.length;
        if (live.length) out.perCall = live.reduce((a, r) => a + r.costUsd, 0) / live.length;
        const durs = runs.map((r) => r.durationMs).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
        if (durs.length) out.p50Ms = durs[Math.floor(durs.length / 2)] ?? null;
        out.ok = true;
      } catch {
        /* the recorded values stand in */
      }
      try {
        const h = await tourApi.health();
        out.spent = h.budget.spentUsd;
        out.limit = h.budget.limitUsd;
        out.ok = true;
      } catch {
        /* the recorded values stand in */
      }
      if (alive) setD(out);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return d;
}

function Gauge({ spent, limit }: { spent: number; limit: number }) {
  const calm = useCalm();
  const pct = Math.max(0, Math.min(1, spent / limit));
  const c = Math.PI * 80;
  return (
    <svg viewBox="0 0 200 120" className="bk-gauge" role="img" aria-label={`Live AI spent: ${usd(spent, 2)} of the ${usd(limit, 0)} shared limit`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" className="bk-gauge__track" strokeWidth="12" strokeLinecap="round" />
      <motion.path
        d="M20 100 A80 80 0 0 1 180 100"
        fill="none"
        className="bk-gauge__fill"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={calm ? false : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - pct) }}
        transition={calm ? { duration: 0 } : { duration: DUR.data, ease: EASE }}
      />
      <text x="100" y="86" textAnchor="middle" className="bk-gauge__v">
        {usd(spent, 2)}
      </text>
      <text x="100" y="108" textAnchor="middle" className="bk-gauge__l">
        of the {usd(limit, 0)} shared limit
      </text>
    </svg>
  );
}

function Figure({ value, label, note, accent }: { value: ReactNode; label: string; note: string; accent?: boolean }) {
  return (
    <section className="bk-card">
      <div className={accent ? 'n-stat n-stat--accent' : 'n-stat'}>
        <div className="n-stat__value">{value}</div>
        <div className="n-stat__label">{label}</div>
        <div className="n-note">{note}</div>
      </div>
    </section>
  );
}

function Cost({ block }: { block: CostBlock }) {
  const calm = useCalm();
  const d = useCostData();
  const loading = d === null;
  const rec = block.recorded;
  const livePer = d?.perCall != null && d.perCall > 0 ? d.perCall : null;
  const perCall = livePer ?? rec.perCallUsd;
  const p50 = d?.p50Ms ?? rec.p50Ms;
  const limit = d?.limit ?? BUDGET_LIMIT_USD;
  const v = (node: ReactNode) => (loading ? <Skeleton width={120} height={30} radius={4} /> : node);
  return (
    <div className="bk-cost" data-testid="backup-cost-live" data-state={loading ? 'loading' : d.ok ? 'live' : 'recorded'}>
      <div className="bk-cost__status">
        {loading ? (
          <span className="bk-cost__line">Reading live numbers from this deployment</span>
        ) : d.ok ? (
          <>
            <Badge tone="success" dot>
              Live
            </Badge>
            <span className="bk-cost__line">Read from this deployment just now</span>
          </>
        ) : (
          <>
            <Badge>Recorded</Badge>
            <span className="bk-cost__line">Live numbers couldn’t be loaded just now, so these are the recorded values</span>
          </>
        )}
      </div>
      <div className="bk-stats">
        <Figure accent value={v(usd(perCall, 4))} label={livePer != null ? 'per call, measured on live runs' : 'per call, from the recorded runs'} note={livePer != null ? `Mean of ${d?.liveRuns ?? 0} live runs` : `Mean of the ${rec.runs} recorded runs`} />
        <Figure value={v(usd(perCall * 1000, 2))} label="per 1,000 calls" note="Before volume discounts or caching" />
        <Figure
          value={v(
            <>
              {(p50 / 1000).toFixed(1)}
              <span className="n-stat__unit">seconds</span>
            </>,
          )}
          label="typical run time"
          note="All ten steps, end to end"
        />
      </div>
      <div className="bk-split">
        <section className="bk-card">
          <h3 className="bk-h3">Live AI spending limit</h3>
          {loading ? <Skeleton width="100%" height={150} radius={8} /> : <Gauge spent={d.spent ?? 0} limit={limit} />}
          <p className="n-body">
            <Rich text={block.limitText} />
          </p>
        </section>
        <section className="bk-card">
          <h3 className="bk-h3">Where a call’s cost goes</h3>
          <div className="bk-bars">
            {block.split.map((s) => (
              <div key={s.label} className="bk-bar">
                <div className="bk-bar__row">
                  <span>{s.label}</span>
                  <span className="n-num">{Math.round(s.share * 100)}%</span>
                </div>
                <div className="bk-bar__track" role="meter" aria-label={`${s.label}: ${Math.round(s.share * 100)}% of a call’s cost`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(s.share * 100)}>
                  <motion.div className="bk-bar__fill" initial={calm ? false : { width: 0 }} animate={{ width: `${s.share * 100}%` }} transition={calm ? { duration: 0 } : { duration: DUR.data, ease: EASE }} />
                </div>
                <span className="n-note">{s.note}</span>
              </div>
            ))}
          </div>
          <p className="n-note bk-card__foot">{block.splitNote}</p>
        </section>
      </div>
      <Callout>
        <b>{block.replay.title}</b> <Rich text={block.replay.text} />
      </Callout>
    </div>
  );
}

// ---------------------------------------------------------------- failure flow

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The flow as a diagram on wide screens; the same steps as a stacked list on narrow ones. */
function Flow({ title, summary, steps }: { title: string; summary: string; steps: FlowStep[] }) {
  const calm = useCalm();
  const step = 196;
  return (
    <section className="bk-card">
      <h3 className="bk-h3">{title}</h3>
      <svg viewBox={`0 30 ${20 + (steps.length - 1) * step + 160} 132`} className="bk-flow" role="img" aria-label={summary}>
        {steps.map((f, i) => {
          const x = 10 + i * step;
          const last = i === steps.length - 1;
          return (
            <g key={f.title}>
              <motion.rect x={x} y={40} width={160} height={74} rx={8} className={f.last ? 'bk-flow__box bk-flow__box--last' : 'bk-flow__box'} initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: calm ? 0 : DUR.ui, delay: calm ? 0 : i * 0.1, ease: EASE }} />
              <text x={x + 80} y={74} textAnchor="middle" className="bk-flow__k">
                {f.title}
              </text>
              <text x={x + 80} y={96} textAnchor="middle" className="bk-flow__s">
                {lower(f.text)}
              </text>
              {!last && (
                <>
                  <motion.path d={`M${x + 160} 77 H${x + step}`} className="bk-flow__line" strokeWidth="1.5" initial={calm ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: calm ? 0 : DUR.layout, delay: calm ? 0 : 0.1 + i * 0.1 }} />
                  <text x={x + 178} y={66} textAnchor="middle" className="bk-flow__f">
                    fails
                  </text>
                </>
              )}
              {f.ok && (
                <>
                  <path d={`M${x + 80} 114 V146 H${x + 92}`} className="bk-flow__okline" fill="none" />
                  <text x={x + 98} y={150} className="bk-flow__ok">
                    {lower(f.ok)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <ol className="bk-flowlist" aria-hidden="true">
        {steps.map((f) => (
          <li key={f.title} data-last={f.last ? 'true' : undefined}>
            <span className="bk-flowlist__when">{f.when ?? 'Always'}</span>
            <b>{f.title}</b>
            <span className="bk-flowlist__d">{f.text}</span>
            {f.ok && <span className="bk-flowlist__ok">{f.ok}</span>}
          </li>
        ))}
      </ol>
      <p className="n-body">{summary}</p>
    </section>
  );
}

// ---------------------------------------------------------------- blocks

function QCard({ c }: { c: CardItem }) {
  return (
    <section className="bk-card" data-accent={c.accent ? 'true' : undefined}>
      {c.kicker && <span className="bk-card__k">{c.kicker}</span>}
      {c.figure ? (
        <div className="bk-guard">
          <span className="bk-guard__t">{c.figure}</span>
          <h3 className="bk-h3">{c.title}</h3>
        </div>
      ) : (
        <h3 className="bk-h3">{c.title}</h3>
      )}
      {c.text && (
        <p className="n-body">
          <Rich text={c.text} />
        </p>
      )}
      {c.entries && (
        <div className="bk-reg">
          {c.entries.map((e) => (
            <div key={e.title} className="bk-reg__row">
              <b>{e.title}</b>
              <Badge tone={e.status.tone} dot={e.status.tone === 'success'}>
                {e.status.label}
              </Badge>
              <span className="bk-reg__meta">
                {e.meta.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
      {c.bullets && (
        <ul className="bk-list">
          {c.bullets.map((b) => (
            <li key={b}>
              <Rich text={b} />
            </li>
          ))}
        </ul>
      )}
      {c.numbered && (
        <ol className="bk-checks">
          {c.numbered.map((n, i) => (
            <li key={n}>
              <span className="bk-checks__n">{i + 1}</span>
              {n}
            </li>
          ))}
        </ol>
      )}
      {c.note && (
        <p className="n-body">
          <Rich text={c.note} />
        </p>
      )}
    </section>
  );
}

function QTable({ label, head, rows, accentCol, widths }: { label: string; head: string[]; rows: TableRow[]; accentCol?: number; widths?: number[] }) {
  return (
    <div className="bk-table-wrap">
      <table className="bk-table" aria-label={label}>
        {widths && (
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: `${w}%` }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.head}>
              <th scope="row">
                <b>{r.head}</b>
                {r.sub && <span className="n-note">{r.sub}</span>}
              </th>
              {r.cells.map((c, i) => (
                <td key={i} data-label={head[i + 1]} className={i === accentCol ? 'bk-accent' : undefined}>
                  <Rich text={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QBlock({ b }: { b: Block }) {
  switch (b.kind) {
    case 'p':
    case 'source':
      return (
        <p className="bk-p">
          <Rich text={b.text} />
        </p>
      );
    case 'callout':
      return (
        <Callout tone={b.tone ?? 'neutral'}>
          {b.title && <b>{b.title}</b>} <Rich text={b.text} />
        </Callout>
      );
    case 'cards':
      return (
        <div className="bk-cards" data-cols={b.cols ?? 2}>
          {b.items.map((c) => (
            <QCard key={c.title} c={c} />
          ))}
        </div>
      );
    case 'table':
      return <QTable label={b.label} head={b.head} rows={b.rows} accentCol={b.accentCol} widths={b.widths} />;
    case 'h3':
      return <h2 className="bk-h2">{b.text}</h2>;
    case 'flow':
      return <Flow title={b.title} summary={b.summary} steps={b.steps} />;
    case 'cost':
      return <Cost block={b} />;
    case 'action':
      return (
        <div>
          <ButtonLink variant="primary" to={b.to} iconRight={<IconArrowRight size={16} />}>
            {b.label}
          </ButtonLink>
        </div>
      );
    case 'list':
      return (
        <ul className="bk-list">
          {b.items.map((s) => (
            <li key={s}>
              <Rich text={s} />
            </li>
          ))}
        </ul>
      );
    case 'related':
      return (
        <nav className="bk-related" aria-label={b.label}>
          <span className="n-label">{b.label}</span>
          {b.links.map((l) => (
            <Link key={l.to} className="n-link" to={l.to}>
              {l.label}
            </Link>
          ))}
        </nav>
      );
    // Chapter-page blocks; the Q&A doesn't use them.
    case 'quote':
    case 'steps':
    case 'qa':
      return null;
  }
}

// ---------------------------------------------------------------- pages

function Topic({ q }: { q: Question }) {
  return (
    <Frame topic={q.id} kicker={INDEX_COPY.questionsTitle} title={q.title} mdHref={`${BASE}${questionMd(q.id)}`}>
      <Arrive key={q.id}>
        <p className="bk-lede">{q.lede}</p>
        {q.blocks.map((b, i) => (
          <QBlock key={i} b={b} />
        ))}
      </Arrive>
    </Frame>
  );
}

function Index() {
  return (
    <Frame topic={null} kicker={INDEX_COPY.questionsTitle} title="The detail behind the likely questions" mdHref={`${BASE}${QUESTIONS_MD}`}>
      <Arrive>
        <p className="bk-lede">{INDEX_COPY.questionsLede}</p>
        <div className="bk-cards" data-cols={3}>
          {QUESTION_PAGES.map((q) => (
            <Link key={q.id} to={questionPath(q.id)} className="bk-index" data-testid={`backup-index-${q.id}`}>
              <b>{q.title}</b>
              <span className="n-body">{q.blurb}</span>
              <span className="bk-index__go">
                Open
                <IconArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      </Arrive>
    </Frame>
  );
}

export function QuestionPage() {
  const { topic } = useParams();
  const q = topic ? questionPage(topic) : undefined;
  useEffect(() => {
    document.title = q ? `${q.title} · Questions · Switchboard` : 'Questions · Switchboard';
    window.scrollTo(0, 0);
  }, [q]);
  if (topic && !q) return <NotFound />;
  return q ? <Topic q={q} /> : <Index />;
}

export default QuestionPage;
