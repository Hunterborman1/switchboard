/**
 * /ops/runbook: Signal Loop's runbook (docs/RUNBOOK.md), rendered in Agent Ops so the
 * agent page and every alert link to something real. /ops/runbook/rfp-responder renders the
 * simulated RFP agent's runbook (docs/runbooks/rfp-responder.md) the same way. A deliberately small Markdown subset:
 * headings, paragraphs, bullet and numbered lists, tables, **bold**, `code` and links.
 */
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import runbook from '../../../docs/RUNBOOK.md?raw';
import rfpRunbook from '../../../docs/runbooks/rfp-responder.md?raw';
import { PageHead, Panel } from '../ui/kit';

/** "Model fallback" → "model-fallback" (the anchors alerts link to). */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

type RunbookDoc = { md: string; path: string; agentId: string; agentName: string };
/** Every runbook the app can render, by slug. No runbook link leaves the app. */
export const RUNBOOKS: Record<string, RunbookDoc> = {
  'signal-loop': { md: runbook, path: 'docs/RUNBOOK.md', agentId: 'agt_signal_loop', agentName: 'Signal Loop' },
  'rfp-responder': { md: rfpRunbook, path: 'docs/runbooks/rfp-responder.md · simulated', agentId: 'agt_rfp_responder', agentName: 'RFP & Security Questionnaire Responder' },
};

/**
 * Runbook links in the registry are repo paths; inside the app they open this page.
 * `docs/RUNBOOK.md#x` → /ops/runbook#x; `docs/runbooks/<slug>.md#x` (or an older seeded
 * `…/runbooks/<slug>#x` wiki URL) → /ops/runbook/<slug>#x when that runbook exists.
 */
export function runbookTarget(url: string): { internal: true; to: string } | { internal: false; href: string } {
  const m = /^(?:\.?\/)?docs\/RUNBOOK\.md(#.*)?$/.exec(url) ?? /\/docs\/RUNBOOK\.md(#.*)?$/.exec(url);
  if (m) return { internal: true, to: `/ops/runbook${m[1] ?? ''}` };
  const r = /(?:^|\/)runbooks\/([a-z0-9-]+)(?:\.md)?\/?(#.*)?$/.exec(url);
  if (r && RUNBOOKS[r[1]!]) return { internal: true, to: `/ops/runbook/${r[1]}${r[2] ?? ''}` };
  return { internal: false, href: url };
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={k++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={k++} className="ao-mono">{t.slice(1, -1)}</code>);
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      out.push(
        href!.startsWith('#') ? (
          <a key={k++} className="ao-link" href={href}>
            {label}
          </a>
        ) : (
          <a key={k++} className="ao-link" href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        ),
      );
    }
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { kind: 'h2' | 'p' | 'ul' | 'ol' | 'table'; lines: string[] };

function blocks(md: string): { title: string; sections: { title: string; body: Block[] }[]; intro: Block[] } {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let title = 'Runbook';
  const intro: Block[] = [];
  const sections: { title: string; body: Block[] }[] = [];
  let cur: Block[] = intro;
  let open: Block | null = null;
  const flush = () => {
    if (open) cur.push(open);
    open = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^# /.test(line)) {
      flush();
      title = line.slice(2).trim();
    } else if (/^## /.test(line)) {
      flush();
      const s = { title: line.slice(3).trim(), body: [] as Block[] };
      sections.push(s);
      cur = s.body;
    } else if (!line.trim()) flush();
    else {
      const kind: Block['kind'] = /^\s*- /.test(line) ? 'ul' : /^\s*\d+\. /.test(line) ? 'ol' : line.startsWith('|') ? 'table' : 'p';
      if (!open || open.kind !== kind) {
        flush();
        open = { kind, lines: [] };
      }
      open.lines.push(line);
    }
  }
  flush();
  return { title, sections, intro };
}

function BlockView({ b }: { b: Block }) {
  if (b.kind === 'ul' || b.kind === 'ol') {
    const items = b.lines.map((l) => l.replace(/^\s*(?:- |\d+\. )/, ''));
    const Tag = b.kind;
    return (
      <Tag style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6, lineHeight: 1.55, fontSize: 14, color: 'var(--ao-text-2)' }}>
        {items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>
    );
  }
  if (b.kind === 'table') {
    const rows = b.lines.filter((l) => !/^\|\s*-/.test(l)).map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    const [head, ...body] = rows;
    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="ao-table">
          <thead>
            <tr>
              {head!.map((h, i) => (
                <th key={i} scope="col">
                  {inline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p style={{ margin: 0, lineHeight: 1.55, fontSize: 14, color: 'var(--ao-text-2)' }}>{inline(b.lines.join(' '))}</p>;
}

export function Runbook() {
  const { doc: slugParam } = useParams();
  const source = RUNBOOKS[slugParam ?? 'signal-loop'] ?? RUNBOOKS['signal-loop']!;
  const doc = blocks(source.md);
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    // After the shell's own scroll reset on navigation.
    const t = window.setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' }), 150);
    return () => window.clearTimeout(t);
  }, [hash]);
  return (
    <div className="ao-page" data-testid="runbook">
      <PageHead
        eyebrow={<Link to={`/ops/agents/${source.agentId}`}>{source.agentName}</Link>}
        title={doc.title}
        sub={doc.intro.length ? doc.intro.map((b) => b.lines.join(' ')).join(' ') : undefined}
        meta={<span className="ao-mono">{source.path}</span>}
      />
      <div style={{ display: 'grid', gap: 16 }}>
        {doc.sections.map((s) => (
          <Panel key={s.title} id={slug(s.title)} title={s.title}>
            <div style={{ display: 'grid', gap: 12 }}>
              {s.body.map((b, i) => (
                <BlockView key={i} b={b} />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
