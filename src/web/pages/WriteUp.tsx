/**
 * /write-up: the written version of the walkthrough, followed by the Q&A, on one page. The
 * problem, Switchboard and Signal Loop, the rollout, what's next and the role, then seven
 * questions (#cost, #security, #failure, #build-vs-buy, #metrics, #agent-ops, #differently).
 * /backup/:topic redirects here (src/web/router.tsx).
 *
 * The prose lives in src/shared/writeup/content.ts, which also renders /write-up.md for AI
 * assistants, so the page and the Markdown say the same things. Everything is visible without
 * a click: no tabs, no accordions, no entrance animation.
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Badge, ButtonLink, Callout, Card, Meter, Skeleton, Stats } from '../../ds';
import { IconArrowRight, IconDownload, IconFileText, IconPlug } from '../../ds/icons';
import { SiteBar } from '../../narrative/components';
import { tourApi } from '../../tour/api';
import { BUDGET_LIMIT_USD } from '../../shared/contracts';
import { REPO_URL } from '../../shared/platform';
import { HERO, PARTS, QUESTIONS, QUESTIONS_INTRO, SECTIONS, parseInline, type Block, type CardItem, type CostBlock, type FlowStep, type Section, type TableRow } from '../../shared/writeup/content';
import './writeup.css';

const BASE = import.meta.env.BASE_URL;

// ---------------------------------------------------------------- inline text

/** **bold** and [label](href): site routes use the router, anchors and URLs are plain links. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) => {
        if (p.kind === 'bold') return <b key={i}>{p.text}</b>;
        if (p.kind === 'text') return <Fragment key={i}>{p.text}</Fragment>;
        if (p.href.startsWith('/'))
          return (
            <Link key={i} className="n-link" to={p.href}>
              {p.text}
            </Link>
          );
        const external = /^https?:/.test(p.href);
        return (
          <a key={i} className="n-link" href={p.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
            {p.text}
          </a>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- blocks

type H = 'h3' | 'h4' | 'h5';

function Cards({ items, cols = 2, h: Title }: { items: CardItem[]; cols?: number; h: H }) {
  return (
    <div className="wu-cards" data-cols={cols}>
      {items.map((c) => (
        <div key={c.title} className="wu-card" data-accent={c.accent ? 'true' : undefined}>
          {c.kicker && <span className="wu-card__k">{c.kicker}</span>}
          {c.figure && <span className="wu-card__fig">{c.figure}</span>}
          <Title className="wu-card__t">{c.title}</Title>
          {c.text && (
            <p className="wu-card__d">
              <Rich text={c.text} />
            </p>
          )}
          {c.entries && (
            <ul className="wu-reg">
              {c.entries.map((e) => (
                <li key={e.title}>
                  <span className="wu-reg__top">
                    <b>{e.title}</b>
                    <Badge tone={e.status.tone} dot={e.status.tone === 'success'}>
                      {e.status.label}
                    </Badge>
                  </span>
                  <span className="wu-reg__meta">
                    {e.meta.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {c.bullets && (
            <ul className="wu-bullets">
              {c.bullets.map((b) => (
                <li key={b}>
                  <Rich text={b} />
                </li>
              ))}
            </ul>
          )}
          {c.numbered && (
            <ol className="wu-numbered">
              {c.numbered.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ol>
          )}
          {c.note && (
            <p className="wu-card__note">
              <Rich text={c.note} />
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Table({ label, head, rows, accentCol, widths }: { label: string; head: string[]; rows: TableRow[]; accentCol?: number; widths?: number[] }) {
  return (
    <div className="wu-table-wrap">
      <table className="wu-table" aria-label={label} data-fixed={widths ? 'true' : undefined}>
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
                {r.sub && <span>{r.sub}</span>}
              </th>
              {r.cells.map((c, i) => (
                <td key={i} data-label={head[i + 1]} className={i === accentCol ? 'is-accent' : undefined}>
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

function Flow({ title, summary, steps }: { title: string; summary: string; steps: FlowStep[] }) {
  return (
    <figure className="wu-flowfig">
      <figcaption>{title}</figcaption>
      <ol className="wu-flow" aria-label={summary}>
        {steps.map((s) => (
          <li key={s.title} data-last={s.last ? 'true' : undefined}>
            <span className="wu-flow__when">{s.when ?? 'Always'}</span>
            <b>{s.title}</b>
            <span className="wu-flow__d">{s.text}</span>
            {s.ok && <span className="wu-flow__ok">{s.ok}</span>}
          </li>
        ))}
      </ol>
      <p className="wu-panel__note">{summary}</p>
    </figure>
  );
}

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

const usd = (n: number, d: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;

function Cost({ block }: { block: CostBlock }) {
  const d = useCostData();
  const loading = d === null;
  const rec = block.recorded;
  const livePer = d?.perCall != null && d.perCall > 0 ? d.perCall : null;
  const perCall = livePer ?? rec.perCallUsd;
  const p50 = d?.p50Ms ?? rec.p50Ms;
  const limit = d?.limit ?? BUDGET_LIMIT_USD;
  const v = (node: ReactNode) => (loading ? <Skeleton width={88} height={24} radius={4} /> : node);
  return (
    <div className="wu-cost" data-testid="writeup-cost-live" data-state={loading ? 'loading' : d.ok ? 'live' : 'recorded'}>
      <div className="wu-cost__status">
        {loading ? (
          <span className="wu-cost__line">Reading live numbers from this deployment</span>
        ) : d.ok ? (
          <>
            <Badge tone="success" dot>
              Live
            </Badge>
            <span className="wu-cost__line">Read from this deployment just now</span>
          </>
        ) : (
          <>
            <Badge>Recorded</Badge>
            <span className="wu-cost__line">Live numbers couldn’t be loaded just now, so these are the recorded values</span>
          </>
        )}
      </div>
      <Stats
        items={[
          { label: 'Per call', value: v(usd(perCall, 4)), sub: livePer != null ? `Mean of ${d?.liveRuns ?? 0} live runs` : `Mean of the ${rec.runs} recorded runs` },
          { label: 'Per 1,000 calls', value: v(usd(perCall * 1000, 2)), sub: 'Before volume discounts or caching' },
          { label: 'Typical run time', value: v((p50 / 1000).toFixed(1)), unit: loading ? undefined : 'seconds', sub: 'All ten steps, end to end' },
        ]}
      />
      <div className="wu-cards" data-cols={2}>
        <div className="wu-card">
          <h4 className="wu-card__t">Live AI spending limit</h4>
          <div className="wu-spend" data-loading={loading ? 'true' : undefined}>
            <span className="wu-spend__v">{loading ? <Skeleton width={64} height={20} radius={4} /> : d.spent != null ? usd(d.spent, 2) : 'Not available'}</span>
            <span className="wu-spend__of">of the {usd(limit, 0)} shared limit</span>
          </div>
          <Meter value={d?.spent ?? 0} max={limit} tone={d?.spent != null && d.spent / limit > 0.8 ? 'warning' : 'accent'} label={`Live AI spent: ${usd(d?.spent ?? 0, 2)} of ${usd(limit, 0)}`} />
          <p className="wu-card__d">
            <Rich text={block.limitText} />
          </p>
          <p className="wu-card__d">
            <b>{block.replay.title}</b> <Rich text={block.replay.text} />
          </p>
        </div>
        <div className="wu-card">
          <h4 className="wu-card__t">Where a call’s cost goes</h4>
          <ul className="wu-split">
            {block.split.map((s) => (
              <li key={s.label}>
                <span className="wu-split__row">
                  <span>{s.label}</span>
                  <span className="ds-num">{Math.round(s.share * 100)}%</span>
                </span>
                <Meter value={s.share} max={1} label={`${s.label}: ${Math.round(s.share * 100)}% of a call’s cost`} />
                <span className="wu-split__note">{s.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="wu-cost__note">{block.splitNote}</p>
    </div>
  );
}

// ---------------------------------------------------------------- sections

function BlockView({ b, level }: { b: Block; level: 2 | 3 }) {
  const card: H = level === 2 ? 'h3' : 'h4';
  switch (b.kind) {
    case 'p':
      return (
        <p className="wu-p">
          <Rich text={b.text} />
        </p>
      );
    case 'callout':
      return (
        <Callout tone={b.tone ?? 'neutral'} title={b.title}>
          <Rich text={b.text} />
        </Callout>
      );
    case 'cards':
      return <Cards items={b.items} cols={b.cols} h={card} />;
    case 'steps':
      return (
        <ol className="wu-steps">
          {b.items.map((s) => (
            <li key={s.title}>
              <b>{s.title}</b>
              <span>
                <Rich text={s.text} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'list':
      return (
        <ul className="wu-list">
          {b.items.map((s) => (
            <li key={s}>
              <Rich text={s} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return <Table label={b.label} head={b.head} rows={b.rows} accentCol={b.accentCol} widths={b.widths} />;
    case 'h3': {
      const Tag = card;
      return <Tag className="wu-h3">{b.text}</Tag>;
    }
    case 'flow':
      return <Flow title={b.title} summary={b.summary} steps={b.steps} />;
    case 'related':
      return (
        <nav className="wu-links" aria-label={b.label}>
          <span className="wu-links__k">{b.label}</span>
          {b.links.map((l) =>
            l.to.startsWith('#') ? (
              <a key={l.to} className="n-link" href={l.to}>
                {l.label}
              </a>
            ) : (
              <Link key={l.to} className="n-link" to={l.to}>
                {l.label}
              </Link>
            ),
          )}
        </nav>
      );
    case 'action':
      return (
        <div>
          <ButtonLink variant="secondary" to={b.to} iconRight={<IconArrowRight size={16} />}>
            {b.label}
          </ButtonLink>
        </div>
      );
    case 'cost':
      return <Cost block={b} />;
  }
}

function SectionView({ s, level }: { s: Section; level: 2 | 3 }) {
  const Title = level === 2 ? 'h2' : 'h3';
  return (
    <section id={s.id} className="wu-sec" aria-labelledby={`${s.id}-h`} data-testid={`writeup-${s.id}`}>
      <p className="wu-sec__k">{s.kicker}</p>
      <Title id={`${s.id}-h`} className="wu-h2">
        {s.title}
      </Title>
      {s.lede && (
        <p className="wu-p wu-p--lede">
          <Rich text={s.lede} />
        </p>
      )}
      {s.blocks.map((b, i) => (
        <BlockView key={i} b={b} level={level} />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- chrome

function useActive(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);
  return active;
}

const READER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Land on the anchor in the URL (/write-up#cost, and every /backup/:topic redirect). Web fonts
 * and the live cost figures can still move it after the first paint, so it follows the anchor
 * for two seconds, until the reader scrolls, taps or types.
 */
function useHashLanding() {
  const { hash } = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1));
    if (!id) return;
    let following = true;
    const land = () => {
      if (following) document.getElementById(id)?.scrollIntoView({ block: 'start' });
    };
    const stop = () => {
      following = false;
    };
    const raf = requestAnimationFrame(land);
    const ro = new ResizeObserver(land);
    ro.observe(document.body);
    const timer = window.setTimeout(stop, 2000);
    READER_INPUT.forEach((e) => window.addEventListener(e, stop, { passive: true }));
    return () => {
      stop();
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.clearTimeout(timer);
      READER_INPUT.forEach((e) => window.removeEventListener(e, stop));
    };
  }, [hash]);
}

function Toc({ active }: { active: string }) {
  const item = (s: Section) => (
    <li key={s.id}>
      <a href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined}>
        {s.nav ?? s.title}
      </a>
    </li>
  );
  return (
    <nav className="wu-toc" aria-label="Contents" data-testid="writeup-toc">
      <div className="wu-toc__group">
        <span className="wu-toc__h">On this page</span>
        <ol>{PARTS.map(item)}</ol>
      </div>
      <div className="wu-toc__group">
        <span className="wu-toc__h">Questions</span>
        <ol>{QUESTIONS.map(item)}</ol>
      </div>
    </nav>
  );
}

const AI_LINKS = [
  { key: 'zip', icon: <IconDownload size={16} />, title: 'Download for AI', desc: 'Every doc as Markdown, in one .zip' },
  { key: 'markdown', icon: <IconFileText size={16} />, title: 'Markdown of this page', desc: 'This write-up and the Q&A as one file' },
  { key: 'claude', icon: <IconPlug size={16} />, title: 'Connect Claude (MCP)', desc: 'Ask questions of the live project and its data' },
] as const;

function ForAi() {
  const inner = (l: (typeof AI_LINKS)[number]) => (
    <>
      <span className="wu-ai__icon" aria-hidden="true">
        {l.icon}
      </span>
      <span className="wu-ai__text">
        <span className="wu-ai__t">{l.title}</span>
        <span className="wu-ai__d">{l.desc}</span>
      </span>
    </>
  );
  const [zip, md, claude] = AI_LINKS;
  return (
    <Card
      className="wu-ai"
      title="For AI assistants"
      description="Give Claude or another assistant the whole project as text, or connect it to the live system."
      flush
      attrs={{ 'data-testid': 'writeup-ai' }}
      footer={
        <span className="wu-ai__foot">
          <a className="n-link" href={`${BASE}llms.txt`} data-testid="writeup-llms">
            llms.txt
          </a>
          <a className="n-link" href={REPO_URL} target="_blank" rel="noreferrer" data-testid="writeup-repo">
            Source code on GitHub
          </a>
        </span>
      }
    >
      <ul className="wu-ai__list">
        <li>
          <a className="wu-ai__row" href={`${BASE}switchboard-docs.zip`} download data-testid="writeup-zip">
            {inner(zip)}
          </a>
        </li>
        <li>
          <a className="wu-ai__row" href={`${BASE}write-up.md`} data-testid="writeup-markdown">
            {inner(md)}
          </a>
        </li>
        <li>
          <Link className="wu-ai__row" to="/app/claude" data-testid="writeup-claude">
            {inner(claude)}
          </Link>
        </li>
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- page

export function WriteUp() {
  const ids = useMemo(() => SECTIONS.map((s) => s.id), []);
  const active = useActive(ids);
  useHashLanding();
  useEffect(() => {
    document.title = 'Write-up · Switchboard';
  }, []);
  return (
    <main className="ds-app sl-n n-page wu-page" data-testid="write-up">
      <SiteBar context="Write-up">
        <ButtonLink variant="ghost" size="sm" to="/walkthrough" className="wu-top__walk">
          Presentation
        </ButtonLink>
        <ButtonLink variant="primary" size="sm" to="/app/overview">
          Open the product
        </ButtonLink>
      </SiteBar>

      <header className="wu-hero">
        <div className="wu-hero__main">
          <p className="wu-kicker">{HERO.kicker}</p>
          <h1 className="n-display wu-title">{HERO.title}</h1>
          <p className="n-lede wu-lede">{HERO.lede}</p>
          <ul className="wu-facts">
            {HERO.facts.map((f) => (
              <li key={f}>
                <Rich text={f} />
              </li>
            ))}
          </ul>
        </div>
        <ForAi />
      </header>

      <div className="wu-layout">
        <aside className="wu-aside">
          <Toc active={active} />
        </aside>

        <article className="wu-article">
          {PARTS.map((s) => (
            <SectionView key={s.id} s={s} level={2} />
          ))}

          <section id={QUESTIONS_INTRO.id} className="wu-sec wu-sec--group" aria-labelledby={`${QUESTIONS_INTRO.id}-h`} data-testid="writeup-questions">
            <p className="wu-sec__k">{QUESTIONS_INTRO.kicker}</p>
            <h2 id={`${QUESTIONS_INTRO.id}-h`} className="wu-h2">
              {QUESTIONS_INTRO.title}
            </h2>
            {QUESTIONS_INTRO.lede && (
              <p className="wu-p wu-p--lede">
                <Rich text={QUESTIONS_INTRO.lede} />
              </p>
            )}
          </section>
          {QUESTIONS.map((s) => (
            <SectionView key={s.id} s={s} level={3} />
          ))}

          <footer className="wu-end">
            <ButtonLink variant="primary" to="/walkthrough" iconRight={<IconArrowRight size={16} />}>
              Start the presentation
            </ButtonLink>
            <ButtonLink variant="secondary" to="/app/overview">
              Open the product
            </ButtonLink>
            <ButtonLink variant="ghost" to="/ops">
              Agent Ops
            </ButtonLink>
          </footer>
        </article>
      </div>
    </main>
  );
}

export default WriteUp;
