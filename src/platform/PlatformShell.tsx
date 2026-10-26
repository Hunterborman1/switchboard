/**
 * The Agent Ops shell: the shared design-system Shell (the same frame as Switchboard),
 * configured for this product. A product switcher top-left, Platform / Observe / Govern
 * navigation, a footer with the walkthrough pill, the way back to Switchboard and the user,
 * and a top bar with breadcrumbs, "About this data" and the time zone.
 *
 * Mount it as the layout for /ops (it renders <Outlet/> unless given children). Rendering it
 * twice is safe: a nested PlatformShell renders only its content.
 */
import './platform.css';
import { createContext, Suspense, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Drawer, Menu, PageSkeleton, ProductMark, Select, Shell, ToastProvider, type Crumb, type NavGroup } from '../ds';
import { IconActivity, IconChevronsUpDown, IconCpu, IconFileText, IconHome, IconInfo, IconSettings, IconShield, IconUsers } from '../ds/icons';
import { useMe } from '../app/api/hooks';
import { PLATFORM_NAME } from '../shared/platform';
import { tourAnchor } from '../tour/anchors';
import { TourPillSlot } from '../tour/hud/pillSlot';
import { TimezoneProvider, useTimezone } from '../ds/time/TimezoneContext';
import type { ConsoleTimezone } from '../ds/time/format';
import type { PlatformMeta } from '../worker/platform/types';
import { useApi } from './lib/api';
import { day, dayYear } from './lib/format';
import { IconCoin } from './ui/icons';

const Nested = createContext(false);
const PRODUCT = 'Agent Ops';
const SWITCHBOARD_HREF = '/app/overview';

const GROUPS: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      { to: '/ops', label: 'Overview', icon: <IconHome />, end: true, match: ['/ops/summary'] },
      { to: '/ops/agents', label: 'Agent registry', icon: <IconCpu />, match: ['/ops/runbook'] },
      { to: '/ops/usage', label: 'Usage', icon: <IconUsers /> },
    ],
  },
  {
    label: 'Observe',
    items: [
      { to: '/ops/logs', label: 'Logs and traces', icon: <IconFileText />, match: ['/ops/traces'] },
      { to: '/ops/reliability', label: 'Reliability', icon: <IconActivity /> },
      { to: '/ops/cost', label: 'Cost', icon: <IconCoin /> },
    ],
  },
  {
    label: 'Govern',
    items: [{ to: '/ops/standard', label: 'Standard and reviews', icon: <IconShield /> }],
  },
];

type Section = { group: string; label: string; to: string };
/** Breadcrumb lead per first path segment. Detail pages append their own crumb with useCrumbs. */
const SECTIONS: Record<string, Section> = {
  '': { group: 'Platform', label: 'Overview', to: '/ops' },
  summary: { group: 'Platform', label: 'Overview', to: '/ops' },
  agents: { group: 'Platform', label: 'Agent registry', to: '/ops/agents' },
  runbook: { group: 'Platform', label: 'Agent registry', to: '/ops/agents' },
  usage: { group: 'Platform', label: 'Usage', to: '/ops/usage' },
  logs: { group: 'Observe', label: 'Logs and traces', to: '/ops/logs' },
  traces: { group: 'Observe', label: 'Logs and traces', to: '/ops/logs' },
  reliability: { group: 'Observe', label: 'Reliability', to: '/ops/reliability' },
  cost: { group: 'Observe', label: 'Cost', to: '/ops/cost' },
  standard: { group: 'Govern', label: 'Standard and reviews', to: '/ops/standard' },
};
const segmentOf = (pathname: string) => pathname.replace(/^.*?\/ops\/?/, '').split('/')[0] ?? '';

function sectionCrumb(pathname: string): Crumb[] {
  const s = SECTIONS[segmentOf(pathname)];
  if (!s) return [{ label: PRODUCT }];
  return [{ label: s.group }, { label: s.label, to: s.to }];
}

function Switcher() {
  const navigate = useNavigate();
  return (
    <Menu
      label="Switch product"
      placement="bottom-start"
      width={268}
      trigger={
        <button type="button" className="ds-switcher">
          <span className="ds-switcher__mark">
            <ProductMark product="agent-ops" size={28} />
          </span>
          <span className="ds-switcher__text">
            <span className="ds-switcher__name">{PRODUCT}</span>
            <span className="ds-switcher__sub">Invoca AI Operations</span>
          </span>
          <IconChevronsUpDown />
        </button>
      }
      items={[
        { kind: 'label', label: 'Products' },
        { label: PLATFORM_NAME, sub: 'Conversations in, the right people out', icon: <ProductMark product="switchboard" size={20} />, onSelect: () => navigate(SWITCHBOARD_HREF) },
        { label: PRODUCT, sub: 'AI operations for every agent', icon: <ProductMark product="agent-ops" size={20} />, checked: true, onSelect: () => navigate('/ops') },
        { kind: 'separator' },
        { label: 'Back to the walkthrough hub', onSelect: () => navigate('/') },
      ]}
    />
  );
}

/** The person using the workspace, as in Switchboard; workspace settings live there. */
function UserMenu() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  return (
    <Menu
      label="Account"
      placement="top-start"
      width={248}
      trigger={
        <button type="button" className="ds-user">
          <Avatar name={me?.name ?? 'You'} initials={me?.initials} size="lg" />
          <span className="ds-user__text">
            <span className="ds-user__name">{me?.name ?? 'Loading…'}</span>
            <span className="ds-user__sub">{me?.title ?? ' '}</span>
          </span>
          <IconChevronsUpDown />
        </button>
      }
      items={[
        { kind: 'label', label: 'Workspace' },
        { label: 'Manage people', icon: <IconUsers />, onSelect: () => navigate('/app/people') },
        { label: 'Workspace settings', icon: <IconSettings />, onSelect: () => navigate('/app/settings') },
      ]}
    />
  );
}

function Footer() {
  return (
    <>
      <TourPillSlot placement="rail" />
      <Link to={SWITCHBOARD_HREF} className="ds-nav-item">
        <ProductMark product="switchboard" size={16} />
        <span className="ds-nav-item__label">{PLATFORM_NAME}</span>
      </Link>
      <UserMenu />
    </>
  );
}

function TimezoneSelect() {
  const { timezone, setTimezone } = useTimezone();
  return (
    <Select
      selectSize="sm"
      className="ao-tz"
      aria-label="Time zone"
      value={timezone}
      onChange={(e) => setTimezone(e.target.value as ConsoleTimezone)}
      options={[
        { value: 'UTC', label: 'UTC' },
        { value: 'America/Los_Angeles', label: 'Pacific' },
      ]}
    />
  );
}

/** One calm explanation of where the numbers come from, available from every page. */
export function AboutDataDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const meta = useApi<PlatformMeta>(open ? '/meta' : null);
  const m = meta.data;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="About this data"
      description="Where the numbers in Agent Ops come from."
      width={480}
      footer={
        <Link to="/ops?assumptions=1" className="ds-btn ds-btn--secondary" onClick={onClose}>
          Review the assumptions
        </Link>
      }
    >
      <div className="ao-stack">
        {[
          {
            title: 'Six weeks of simulated history',
            body: `Org-wide usage, runs and costs${m ? ` from ${day(m.simulatedFrom)} to ${dayYear(m.simulatedTo)}` : ''} are simulated so the platform has a realistic history. Simulated items are labelled where they appear on their own.`,
          },
          { title: 'Live activity from this demo', body: 'Signal Loop is a real agent. Its runs, AI calls and deliveries, and the people using this demo right now, report here live and are labelled Live.' },
          {
            title: 'Hours saved and value are estimates',
            body: 'Hours saved compare each task with how long it takes by hand, minus the time a person spent reviewing. Value is hours saved times a loaded hourly cost. Both are assumptions you can edit.',
          },
          { title: 'AI cost is metered, not billed', body: 'AI cost adds up the token usage each AI call reports. It is not an invoice and leaves out build time and seat licences.' },
        ].map((x) => (
          <section key={x.title}>
            <h3 className="ao-subhead">{x.title}</h3>
            <p className="ao-note">{x.body}</p>
          </section>
        ))}
      </div>
    </Drawer>
  );
}

function TopbarEnd() {
  const [about, setAbout] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" icon={<IconInfo size={14} />} onClick={() => setAbout(true)} data-testid="about-data" aria-label="About this data">
        <span className="ao-about-label">About this data</span>
      </Button>
      <TimezoneSelect />
      <TourPillSlot placement="bar" />
      <AboutDataDrawer open={about} onClose={() => setAbout(false)} />
    </>
  );
}

function ShellInner({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <TimezoneProvider>
      <ToastProvider>
        <Shell
          className="ao-app"
          switcher={<Switcher />}
          groups={GROUPS}
          footer={<Footer />}
          sectionCrumb={sectionCrumb}
          topbarEnd={<TopbarEnd />}
          mobileBrand={
            <>
              <ProductMark product="agent-ops" size={22} />
              {PRODUCT}
            </>
          }
          menuAttrs={tourAnchor('nav.menu')}
        >
          <Suspense fallback={<PageSkeleton />}>{children ?? <Outlet />}</Suspense>
        </Shell>
      </ToastProvider>
    </TimezoneProvider>
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

