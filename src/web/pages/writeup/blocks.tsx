/**
 * The write-up's blocks (src/shared/writeup/types.ts) drawn in the write-up's design: the article
 * column, quiet cards, bordered lists and tables. Everything is on the page at once: no tabs,
 * no accordions, nothing to click to read.
 */
import { Link } from 'react-router-dom';
import { Badge, ButtonLink, Callout, Quote } from '../../../ds';
import { IconArrowRight } from '../../../ds/icons';
import type { Block, CardItem, Section, TableRow } from '../../../shared/writeup/types';
import { Rich } from './Rich';

type H = 'h3' | 'h4';

export function Cards({ items, cols = 2, h: Title = 'h3' }: { items: CardItem[]; cols?: number; h?: H }) {
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

export function Table({ label, head, rows, accentCol, widths }: { label: string; head: string[]; rows: TableRow[]; accentCol?: number; widths?: number[] }) {
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

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'p':
      return (
        <p className="wu-p">
          <Rich text={b.text} />
        </p>
      );
    case 'source':
      return (
        <p className="wu-source">
          <Rich text={b.text} />
        </p>
      );
    case 'callout':
      return (
        <Callout tone={b.tone ?? 'neutral'} title={b.title}>
          <Rich text={b.text} />
        </Callout>
      );
    case 'quote':
      return (
        <Quote size="lg" cite={b.cite}>
          “{b.text}”
        </Quote>
      );
    case 'cards':
      return <Cards items={b.items} cols={b.cols} />;
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
    case 'qa':
      return (
        <dl className="wu-qa">
          {b.items.map((it) => (
            <div key={it.q}>
              <dt>
                <Rich text={it.q} />
              </dt>
              <dd>
                <Rich text={it.a} />
              </dd>
            </div>
          ))}
        </dl>
      );
    case 'table':
      return <Table label={b.label} head={b.head} rows={b.rows} accentCol={b.accentCol} widths={b.widths} />;
    case 'h3':
      return <h3 className="wu-h3">{b.text}</h3>;
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
    // The flow and the live cost figures belong to the Q&A pages (./QuestionPage.tsx).
    case 'flow':
    case 'cost':
      return null;
  }
}

export function SectionView({ s }: { s: Section }) {
  return (
    <section id={s.id} className="wu-sec" aria-labelledby={`${s.id}-h`} data-testid={`writeup-${s.id}`}>
      <h2 id={`${s.id}-h`} className="wu-h2">
        {s.title}
      </h2>
      {s.lede && (
        <p className="wu-p wu-p--lede">
          <Rich text={s.lede} />
        </p>
      )}
      {s.blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </section>
  );
}
