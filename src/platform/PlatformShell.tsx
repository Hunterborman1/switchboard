/**
 * Agent Ops shell: the shared light ConsoleShell (same sidebar as Signal Loop, per
 * docs/DESIGN.md "Shells"), with a product switcher at the top, sentence-case section labels,
 * and a slim top bar carrying the section title, an "About this data" panel and a compact
 * time-zone select on every page.
 */
import '../theme/invoca.css';
import '../uis/uis.css';
import './platform.css';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ConsoleShell, type ConsoleNavGroup } from '../uis/ConsoleShell';
import { TimezoneProvider, useTimezone } from '../uis/TimezoneContext';
import type { ConsoleTimezone } from '../uis/format';
import { TourPillSlot } from '../tour/hud/pillSlot';
import type { PlatformMeta } from '../worker/platform/types';
import { useApi } from './lib/api';
import { day, dayYear } from './lib/format';
import { IconInfoSmall } from './ui/InfoTip';
import { Drawer } from './ui/kit';
import { IconCost, IconLogs, IconOverview, IconPulse, IconRegistry, IconShield, IconUsers } from './ui/icons';

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
      { to: '/ops/logs', label: 'Logs and traces', icon: <IconLogs /> },
      { to: '/ops/reliability', label: 'Reliability', icon: <IconPulse /> },
      { to: '/ops/cost', label: 'Cost', icon: <IconCost /> },
    ],
  },
  {
    label: 'Govern',
    items: [{ to: '/ops/standard', label: 'Standard and reviews', icon: <IconShield /> }],
  },
];

/** Section title per first path segment, with the nav group it sits under. */
const CRUMB: Record<string, { label: string; group?: string; groupTo?: string }> = {
  '': { label: 'Overview', group: 'Platform' },
  agents: { label: 'Agent registry', group: 'Platform' },
  usage: { label: 'Usage', group: 'Platform' },
  logs: { label: 'Logs and traces', group: 'Observe' },
  traces: { label: 'Trace', group: 'Logs and traces', groupTo: '/ops/logs' },
  reliability: { label: 'Reliability', group: 'Observe' },
  cost: { label: 'Cost', group: 'Observe' },
  standard: { label: 'Standard and reviews', group: 'Govern' },
  summary: { label: 'Executive summary', group: 'Overview', groupTo: '/ops' },
  runbook: { label: 'Runbook', group: 'Agent registry', groupTo: '/ops/agents' },
};

function Mark() {
  return (
    <span className="ao-brand-mark" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="4" cy="4" r="1.6" />
        <circle cx="12" cy="4" r="1.6" />
        <circle cx="4" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" fill="#fff" />
        <path d="M5.6 4h4.8M4 5.6v4.8M5.6 12h4.8M12 5.6v4.8" />
      </svg>
    </span>
  );
}

/** Product name + switcher. Signal Loop and Agent Ops share this shell; the switcher moves between them. */
function Brand() {
  return (
    <>
      <Link to="/ops" className="ao-brand" aria-label="Agent Ops home">
        <Mark />
        <span className="ao-brand-name">Agent Ops</span>
        <span className="ao-brand-tag">Demo</span>
      </Link>
      <nav className="ao-switch" aria-label="Product">
        <Link to="/app">Signal Loop</Link>
        <Link to="/ops" aria-current="true">
          Agent Ops
        </Link>
      </nav>
    </>
  );
}

function BrandCollapsed() {
  return (
    <Link to="/ops" className="ao-brand-collapsed" aria-label="Agent Ops home" title="Agent Ops">
      <Mark />
    </Link>
  );
}

function Footer({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="ao-footer">
      <TourPillSlot placement="rail" compact={collapsed} />
      {collapsed ? null : <p className="ao-footer-note">Every agent reports here. Signal Loop is one of them.</p>}
    </div>
  );
}

function TimezoneSelect() {
  const { timezone, setTimezone } = useTimezone();
  return (
    <label className="ao-tz">
      <span>Time zone</span>
      <select className="ao-select" aria-label="Time zone" value={timezone} onChange={(e) => setTimezone(e.target.value as ConsoleTimezone)}>
        <option value="UTC">UTC</option>
        <option value="America/Los_Angeles">Pacific (PT)</option>
      </select>
    </label>
  );
}

/** One calm explanation of where the numbers come from, available from every page. */
export function AboutDataDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const meta = useApi<PlatformMeta>('/meta');
  const m = meta.data;
  return (
    <Drawer open={open} onClose={onClose} title="About this data" sub="Where the numbers in Agent Ops come from.">
      <dl className="ao-deflist">
        <div>
          <dt>Six weeks of simulated history</dt>
          <dd>
            Org-wide usage, runs and costs{m ? ` from ${day(m.simulatedFrom)} to ${dayYear(m.simulatedTo)}` : ''} are simulated so the platform has a realistic history to show. Every simulated item is
            labelled “Simulated” where it appears on its own.
          </dd>
        </div>
        <div>
          <dt>Live activity from this demo</dt>
          <dd>Signal Loop is a real agent. Its runs, AI calls, deliveries and the people using this demo right now report here live and are labelled “Live”.</dd>
        </div>
        <div>
          <dt>Hours saved and value are estimates</dt>
          <dd>
            Hours saved compares each task with how long it takes by hand (a registered baseline, to be confirmed by a two-week time study), minus the time a person spent reviewing. Value is hours saved
            multiplied by a loaded hourly cost. Both baselines and the hourly cost are editable under Assumptions on the overview.
          </dd>
        </div>
        <div>
          <dt>AI cost is metered, not billed</dt>
          <dd>AI cost adds up the token usage each AI call reports. It is not an invoice and leaves out build time and seat licences.</dd>
        </div>
      </dl>
      <p>
        <Link to="/ops?assumptions=1" className="ao-link" onClick={onClose}>
          Review the assumptions
        </Link>
      </p>
    </Drawer>
  );
}

function TopBar() {
  const { pathname } = useLocation();
  const [about, setAbout] = useState(false);
  const seg = pathname.replace(/^.*\/ops\/?/, '').split('/')[0] ?? '';
  const c = CRUMB[seg] ?? { label: 'Agent Ops' };
  const deep = pathname.split('/').filter(Boolean).length > 2 && seg && seg !== 'traces' && seg !== 'summary' && seg !== 'runbook';
  return (
    <div className="ao-topbar ao-noprint">
      <nav className="ao-crumbs" aria-label="Breadcrumb">
        {deep ? (
          <>
            <Link to={`/ops/${seg}`} className="ao-crumb-title">
              {c.label}
            </Link>
          </>
        ) : (
          <>
            {c.group ? (
              <>
                {c.groupTo ? (
                  <Link to={c.groupTo} className="ao-crumb-parent">
                    {c.group}
                  </Link>
                ) : (
                  <span className="ao-crumb-parent">{c.group}</span>
                )}
                <span className="sep" aria-hidden="true">
                  /
                </span>
              </>
            ) : null}
            <span aria-current="page">{c.label}</span>
          </>
        )}
      </nav>
      <div className="ao-topbar-end">
        <button type="button" className="ao-btn ghost sm" onClick={() => setAbout(true)} data-testid="about-data" aria-label="About this data">
          <IconInfoSmall /> <span className="ao-about-label">About this data</span>
        </button>
        <TimezoneSelect />
      </div>
      <AboutDataDrawer open={about} onClose={() => setAbout(false)} />
    </div>
  );
}

function ShellInner({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  useEffect(() => {
    // The host page's body may carry another background; the platform owns its own.
    const prevBg = document.body.style.background;
    document.body.style.background = '#FFFFFF';
    return () => {
      document.body.style.background = prevBg;
    };
  }, []);
  useEffect(() => {
    const prev = document.title;
    const seg = pathname.replace(/^.*\/ops\/?/, '').split('/')[0] ?? '';
    document.title = `${CRUMB[seg]?.label ?? 'Agent Ops'} · Agent Ops`;
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
          brandCollapsed={<BrandCollapsed />}
          mobileBrand={<span style={{ fontWeight: 600 }}>Agent Ops</span>}
          groups={GROUPS}
          footer={<Footer collapsed={false} />}
          footerCollapsed={<Footer collapsed />}
          mobileBarEnd={<TourPillSlot placement="bar" />}
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
