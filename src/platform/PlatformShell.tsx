/**
 * Agent Ops shell: the UIS ConsoleShell (collapsible rail, mobile drawer) on the Invoca
 * HB tokens, re-themed deep-blue under `.ao-app` so the platform reads as a different place
 * from any one agent. A slim top bar carries the breadcrumb, the persistent "Simulated org
 * data" marker and the timezone toggle on every page.
 */
import '../theme/invoca.css';
import '../uis/uis.css';
import './platform.css';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ConsoleShell, type ConsoleNavGroup } from '../uis/ConsoleShell';
import { TimezoneProvider } from '../uis/TimezoneContext';
import { TimezoneToggle } from '../uis/TimezoneToggle';
import type { PlatformMeta } from '../worker/platform/types';
import { useApi } from './lib/api';
import { day, dayYear } from './lib/format';
import { IconAgent, IconArrowUpRight, IconCost, IconLogs, IconOverview, IconPulse, IconRegistry, IconShield, IconUsers } from './ui/icons';

const Nested = createContext(false);

const GROUPS: ConsoleNavGroup[] = [
  {
    label: 'Platform',
    items: [
      { to: '/ops', label: 'Overview', icon: <IconOverview />, end: true },
      { to: '/ops/agents', label: 'Agent registry', icon: <IconRegistry /> },
      { to: '/ops/usage', label: 'Usage', icon: <IconUsers /> },
    ],
  },
  {
    label: 'Observe',
    items: [
      { to: '/ops/logs', label: 'Logs & traces', icon: <IconLogs /> },
      { to: '/ops/reliability', label: 'Reliability', icon: <IconPulse /> },
      { to: '/ops/cost', label: 'Cost', icon: <IconCost /> },
    ],
  },
  {
    label: 'Govern',
    items: [{ to: '/ops/standard', label: 'Standard & reviews', icon: <IconShield /> }],
  },
];

const CRUMB: Record<string, string> = {
  '': 'Overview',
  agents: 'Agent registry',
  usage: 'Usage',
  logs: 'Logs & traces',
  traces: 'Trace',
  reliability: 'Reliability',
  cost: 'Cost',
  standard: 'Standard & reviews',
  summary: 'Executive summary',
};

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/ops" className="ao-brand" aria-label="Agent Ops home">
      <span className="ao-brand-mark" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="4" cy="4" r="1.6" />
          <circle cx="12" cy="4" r="1.6" />
          <circle cx="4" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" fill="#C9D2FF" stroke="#C9D2FF" />
          <path d="M5.6 4h4.8M4 5.6v4.8M5.6 12h4.8M12 5.6v4.8" strokeOpacity=".7" />
        </svg>
      </span>
      {collapsed ? null : (
        <span className="ao-brand-text">
          <b>Agent Ops</b>
          <small>AI Operations · Invoca (demo)</small>
        </span>
      )}
    </Link>
  );
}

function Footer({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="ao-footer">
      <Link to="/app" className={`ao-agent-link${collapsed ? ' is-collapsed' : ''}`} aria-label={collapsed ? 'Open Signal Loop, the agent' : undefined} title={collapsed ? 'Open Signal Loop' : undefined}>
        <IconAgent size={16} />
        {collapsed ? null : (
          <>
            <span style={{ flex: 1 }}>
              Open Signal Loop
              <small>The agent itself</small>
            </span>
            <IconArrowUpRight size={14} />
          </>
        )}
      </Link>
      {collapsed ? null : <p className="ao-footer-note">Agent Ops is the platform every agent reports into. Signal Loop is one agent in it.</p>}
    </div>
  );
}

function TopBar() {
  const { pathname } = useLocation();
  const meta = useApi<PlatformMeta>('/meta');
  const seg = pathname.replace(/^.*\/ops\/?/, '').split('/')[0] ?? '';
  const label = CRUMB[seg] ?? 'Agent Ops';
  const m = meta.data;
  return (
    <div className="ao-topbar ao-noprint">
      <nav className="ao-crumbs" aria-label="Breadcrumb">
        <Link to="/ops">Agent Ops</Link>
        {seg ? (
          <>
            <span className="sep" aria-hidden="true">
              /
            </span>
            {pathname.split('/').filter(Boolean).length > 2 && seg !== 'traces' ? <Link to={`/ops/${seg}`}>{label}</Link> : <span aria-current="page">{label}</span>}
          </>
        ) : null}
      </nav>
      <div className="ao-topbar-end">
        <span className="ao-simmark" title="Everything except Signal Loop’s live telemetry and real demo viewers is simulated, and labelled where it appears.">
          <i aria-hidden="true" />
          Simulated org data · 6 weeks{m ? ` (${day(m.simulatedFrom)} – ${dayYear(m.simulatedTo)})` : ''}
        </span>
        <TimezoneToggle />
      </div>
    </div>
  );
}

function ShellInner({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  useEffect(() => {
    // The host page's body carries the narrative's dark background; the platform owns its own.
    const prevBg = document.body.style.background;
    document.body.style.background = '#F9F9F6';
    return () => {
      document.body.style.background = prevBg;
    };
  }, []);
  useEffect(() => {
    const prev = document.title;
    const seg = pathname.replace(/^.*\/ops\/?/, '').split('/')[0] ?? '';
    document.title = `${CRUMB[seg] ?? 'Agent Ops'} · Agent Ops`;
    return () => {
      document.title = prev;
    };
  }, [pathname]);
  return (
    <div className="sl-app ao-app">
      <a href="#main-content" className="ao-sr" style={{ position: 'absolute' }} onFocus={(e) => e.currentTarget.classList.remove('ao-sr')} onBlur={(e) => e.currentTarget.classList.add('ao-sr')}>
        Skip to content
      </a>
      <TimezoneProvider>
        <ConsoleShell
          storageKey="ao-rail-collapsed"
          brand={<Brand />}
          brandCollapsed={<Brand collapsed />}
          mobileBrand={<span style={{ fontWeight: 500 }}>Agent Ops</span>}
          groups={GROUPS}
          footer={<Footer collapsed={false} />}
          footerCollapsed={<Footer collapsed />}
          className="ao-shell"
        >
          <TopBar />
          {children ?? <Outlet />}
        </ConsoleShell>
      </TimezoneProvider>
    </div>
  );
}

/** Layout for /ops. Renders `children` when given (the router's mount passes <Outlet/>), else its own outlet. */
export function PlatformShell({ children }: { children?: ReactNode }) {
  const nested = useContext(Nested);
  if (nested) return <>{children ?? <Outlet />}</>;
  return (
    <Nested.Provider value>
      <ShellInner>{children}</ShellInner>
    </Nested.Provider>
  );
}

