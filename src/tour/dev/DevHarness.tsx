/**
 * DEV ONLY (never in the production bundle): a stand-in product that renders every tour
 * anchor and emits the same events as the real UI, plus a fake RunDetail endpoint, so the
 * walkthrough engine can be exercised before / without the product. Enable with ?dev=1.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { emit } from '../../shared/events';
import { STEP_KEYS, type RunDetail, type StepKey } from '../../shared/contracts';
import { tourAnchor, type AnchorId } from '../anchors';

const FILES = [
  { id: 'file_c1042', name: '2026-10-21_Brightline_QBR_transcript.vtt', path: 'main', rec: true },
  { id: 'file_clean', name: 'northwind-notes-oct.md', path: 'clean' },
  { id: 'file_messy', name: 'atlas_call_raw_asr.txt', path: 'messy' },
  { id: 'file_inj', name: 'fwd_ RE_ renewal concerns.eml', path: 'security' },
  { id: 'file_neg', name: 'keystone-checkin.vtt', path: 'negative' },
  { id: 'file_phi', name: 'meridian_intake_call.vtt', path: 'privacy' },
];

let runStart = 0;
let runPath = 'main';

function fakeRun(id: string): RunDetail {
  const el = Date.now() - runStart;
  const per = 1500;
  const steps = STEP_KEYS.map((key: StepKey, i) => ({
    runId: id, key, status: (el > (i + 1) * per ? 'passed' : el > i * per ? 'running' : 'pending') as RunDetail['steps'][number]['status'],
    startedAt: null, finishedAt: null, durationMs: 300, model: null, tokensIn: null, tokensOut: null, costUsd: 0.0004, summary: null, detail: key === 'ground' ? { note: 'stitched from two turns' } : null,
  }));
  const done = el > STEP_KEYS.length * per;
  const neg = runPath === 'negative';
  const mkIns = (n: number, method: 'exact' | 'fuzzy' | 'failed', gate: 'auto_route' | 'review' | 'dropped') => ({
    id: `ins_${n}`, workspaceId: 'dev', runId: id, accountId: 'acct_brightline', csmId: 'ppl_x', type: 'feature_request' as const, summary: `Insight ${n}`, productArea: 'integrations' as const,
    severity: 'medium' as const, sentiment: 'negative' as const, rationale: '', evidence: [{ quote: 'q', turnId: 't1', start: 0, end: 1, matchedText: 'q', score: method === 'failed' ? 0.4 : 1, method }],
    confidenceModel: 0.9, groundingScore: 1, confidenceFinal: gate === 'review' ? 0.71 : 0.86, gate, gateReasons: [], status: gate === 'dropped' ? ('dropped_ungrounded' as const) : gate === 'review' ? ('pending_review' as const) : ('routed' as const),
    themeId: null, ownerId: null, channel: null, ruleId: null, promptVersion: 'v4', model: 'fast', createdAt: new Date().toISOString(),
  });
  const insights = neg || el < 6 * per ? [] : [mkIns(1, 'exact', 'auto_route'), mkIns(2, 'exact', 'auto_route'), mkIns(3, runPath === 'messy' ? 'fuzzy' : 'exact', 'review'), mkIns(4, 'failed', 'dropped')];
  return {
    run: { id, workspaceId: 'dev', fileId: 'file_c1042', filename: 'x', accountId: null, callId: 'C-1042', status: done ? 'completed' : 'running', mode: 'replay', modeReason: 'seed', sha256: 'x', createdAt: '', finishedAt: null, durationMs: done ? 14200 : null, costUsd: 0.0031, promptVersion: 'v4', insightCount: insights.length, droppedCount: neg ? 0 : 1, reviewCount: 1, injectionFlagged: runPath === 'security', actionable: !neg },
    steps, turns: [], redactions: [{ token: '[PERSON_1]', kind: 'person', preview: 'D•••', count: 3 }, { token: '[PHONE_1]', kind: 'phone', preview: '•••', count: 1 }], insights, deliveries: [],
    screen: el > 4 * per ? { actionable: !neg, language: 'en', injection_suspected: runPath === 'security', injection_excerpt: null, call_kind: 'qbr', reason: '' } : null,
  };
}

if (typeof window !== 'undefined' && !(window as unknown as { __slDevFetch?: boolean }).__slDevFetch) {
  (window as unknown as { __slDevFetch?: boolean }).__slDevFetch = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const m = url.match(/\/api\/runs\/(dev_run_[\w]+)/);
    if (m) return new Response(JSON.stringify({ data: fakeRun(m[1]!), dataAsOf: new Date().toISOString() }), { headers: { 'content-type': 'application/json' } });
    return orig(input, init);
  };
}

const A = (id: AnchorId) => tourAnchor(id);

function Box({ id, children, h = 80 }: { id?: AnchorId; children: React.ReactNode; h?: number }) {
  return (
    <div {...(id ? A(id) : {})} style={{ border: '1px solid #E3E4E1', borderRadius: 10, padding: 14, background: '#fff', minHeight: h }}>
      {children}
    </div>
  );
}

function NewCall() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <h1>New call</h1>
      <div style={{ display: 'flex', gap: 12 }}>
        <button {...A('new.upload')} onClick={() => { setOpen(true); emit({ name: 'picker.opened' }); }}>Bring in a call</button>
        <button {...A('new.run')} disabled={!sel} onClick={() => {
          const id = `dev_run_${Date.now() % 100000}`;
          runStart = Date.now();
          runPath = FILES.find((f) => f.id === sel)?.path ?? 'main';
          emit({ name: 'run.started', runId: id, fileId: sel, mode: 'replay' });
          nav(`/app/runs/${id}${window.location.search}`);
        }}>Run pipeline</button>
        <span>{sel ?? 'no file'}</span>
      </div>
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgb(0 0 0 / .3)', display: 'grid', placeItems: 'center', zIndex: 70 }}>
          <div role="dialog" {...A('picker.dialog')} style={{ background: '#fff', borderRadius: 12, padding: 18, width: 640, display: 'grid', gap: 8 }}>
            <div {...A('picker.folder')}>Calls / Week 43</div>
            {FILES.map((f) => (
              <button key={f.id} {...(f.rec ? A('picker.recommended') : {})} style={{ textAlign: 'left', fontWeight: sel === f.id ? 700 : 400 }} onClick={() => { setSel(f.id); emit({ name: 'file.selected', fileId: f.id, tourPath: f.path }); }}>
                {f.rec ? '★ ' : ''}{f.name}
              </button>
            ))}
            <div {...A('picker.preview')} style={{ color: '#666' }}>Preview…</div>
            <button {...A('picker.open')} onClick={() => { setOpen(false); emit({ name: 'picker.closed' }); }}>Open</button>
          </div>
        </div>
      )}
    </>
  );
}

function RunView({ id }: { id: string }) {
  const [, tick] = useState(0);
  const [before, setBefore] = useState(false);
  useEffect(() => {
    let k = 0;
    const t = window.setInterval(() => {
      tick((x) => x + 1);
      const el = Date.now() - runStart;
      const idx = Math.floor(el / 1500) - 1;
      if (idx >= 0 && idx < STEP_KEYS.length && idx >= k) {
        emit({ name: 'run.step', runId: id, step: STEP_KEYS[idx]!, status: 'passed' });
        k = idx + 1;
      }
    }, 500);
    return () => window.clearInterval(t);
  }, [id]);
  const r = fakeRun(id);
  return (
    <>
      <h1>Run {id}</h1>
      <Box id="run.stepper" h={50}>{r.steps.map((s) => `${s.key}:${s.status[0]}`).join(' · ')}</Box>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
        <Box id="run.transcript" h={300}>
          Transcript {before ? '(before)' : '(after)'}
          <div><button {...A('run.redaction')} onClick={() => { setBefore((b) => !b); emit({ name: 'redaction.toggled', showing: before ? 'after' : 'before' }); }}>Toggle redaction</button></div>
        </Box>
        <div style={{ display: 'grid', gap: 12 }}>
          <Box id="run.screen">Screen {r.screen ? 'done' : '…'}</Box>
          <Box id="run.insights">{r.insights.length ? r.insights.map((i) => <div key={i.id} {...(i.gate === 'dropped' ? A('run.dropped') : {})}>{i.summary} · {i.gate}</div>) : 'No insights (yet)'}</Box>
          <Box id="run.gate">Gate</Box>
          <Box id="run.trace">Trace</Box>
        </div>
      </div>
    </>
  );
}

function Review() {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'a') emit({ name: 'review.action', insightId: 'ins_3', action: 'approve' });
      if (e.key === 'e') emit({ name: 'review.action', insightId: 'ins_3', action: 'edit' });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <>
      <h1>Review</h1>
      <Box id="review.queue" h={200}>
        <div {...A('review.item')} style={{ padding: 10, border: '1px dashed #ccc' }}>
          Item · <span {...A('review.why')}>confidence 0.71 &lt; 0.80</span>
          <div {...A('review.evidence')}>“quote”</div>
          <button {...A('review.approve')} onClick={() => emit({ name: 'review.action', insightId: 'ins_3', action: 'approve' })}>Approve (A)</button>{' '}
          <button {...A('review.edit')} onClick={() => emit({ name: 'review.action', insightId: 'ins_3', action: 'edit' })}>Edit (E)</button>
        </div>
      </Box>
    </>
  );
}

function Simple({ ids, title, act }: { ids: AnchorId[]; title: string; act?: Partial<Record<AnchorId, () => void>> }) {
  return (
    <>
      <h1>{title}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {ids.map((id) => (
          <Box key={id} id={id}>
            {id}
            {act?.[id] && <div><button onClick={act[id]}>Do it</button></div>}
          </Box>
        ))}
      </div>
    </>
  );
}

export default function DevHarness({ area }: { area: 'app' | 'ops' }) {
  const loc = useLocation();
  const nav = useNavigate();
  const p = loc.pathname;
  const page = useMemo(() => {
    if (p.startsWith('/app/new')) return <NewCall />;
    const run = p.match(/^\/app\/runs\/(.+)$/);
    if (run) return <RunView id={run[1]!} />;
    if (p.startsWith('/app/review')) return <Review />;
    if (p.startsWith('/app/routing')) return <Simple title="Routing" ids={['routing.rules', 'routing.rule.pricing', 'routing.sankey', 'routing.deliveries', 'dest.jira', 'dest.slack']} act={{ 'routing.rule.pricing': () => emit({ name: 'rule.changed', ruleId: 'rule_pricing' }) }} />;
    if (p.startsWith('/app/themes/')) return <Simple title="Theme" ids={['theme.arr', 'theme.trend', 'theme.quotes']} />;
    if (p.startsWith('/app/themes')) return <Simple title="Themes" ids={['themes.list', 'theme.c1042']} act={{ 'theme.c1042': () => { emit({ name: 'theme.opened', themeId: 'thm_gads' }); nav(`/app/themes/thm_gads${loc.search}`); } }} />;
    if (p.startsWith('/app/loop')) return <Simple title="Loop" ids={['ticket.state', 'loop.inbox', 'loop.note']} act={{ 'ticket.state': () => emit({ name: 'ticket.state', deliveryId: 'dlv_1', state: 'shipped' }) }} />;
    if (p.startsWith('/app/evals')) return <Simple title="Evals" ids={['evals.metrics', 'evals.levels', 'evals.candidate', 'evals.promote', 'evals.gate']} act={{ 'evals.promote': () => emit({ name: 'eval.promote_attempted', promoted: false }) }} />;
    if (p.startsWith('/app/health')) return <Simple title="Health" ids={['health.budget']} />;
    if (p.startsWith('/ops/registry')) return <Simple title="Registry" ids={['ops.registry', 'ops.registry.signal']} />;
    if (p.startsWith('/ops/agents')) return <Simple title="Agent" ids={['ops.agent.review', 'ops.agent.standard']} />;
    if (p.startsWith('/ops/usage')) return <Simple title="Usage" ids={['ops.usage.live', 'ops.usage.heatmap']} />;
    if (p.startsWith('/ops/logs')) return <Simple title="Logs" ids={['ops.logs', 'ops.logs.trace']} />;
    if (p.startsWith('/ops/traces')) return <Simple title="Trace" ids={['ops.trace.waterfall']} />;
    if (p.startsWith('/ops/reliability')) return <Simple title="Reliability" ids={['ops.slos', 'ops.alerts']} />;
    if (p.startsWith('/ops')) return <Simple title="Agent Ops" ids={['ops.overview.kpis', 'ops.overview.chart', 'ops.overview.attention']} />;
    return <h1>Dev harness: {p}</h1>;
  }, [p, nav, loc.search]);
  const links: [string, AnchorId | null][] = [['/app/new', 'nav.new'], ['/app/review', 'nav.review'], ['/app/routing', 'nav.routing'], ['/app/themes', 'nav.themes'], ['/app/loop', 'nav.loop'], ['/app/evals', 'nav.evals'], ['/app/health', null], ['/ops', 'nav.agentops']];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100dvh', fontFamily: 'Inter, system-ui', background: '#F9F9F6', color: '#0A231E' }} data-dev-harness={area}>
      <aside style={{ background: '#0A231E', color: '#F2F5E4', padding: 16, display: 'grid', alignContent: 'start', gap: 8 }}>
        <b>DEV HARNESS</b>
        {links.map(([to, id]) => (
          <Link key={to} to={to} style={{ color: '#D1FFD1' }} {...(id ? A(id) : {})}>{to}</Link>
        ))}
        <span {...A('budget.pill')}>$0.31 / $15</span>
      </aside>
      <section style={{ padding: 24 }}>{page}</section>
    </div>
  );
}
