/**
 * The Switchboard shell: the shared design-system Shell configured for this product.
 * Signal Loop is one analysis inside it, so its pages sit in their own nav group.
 *
 * Owns the product root (`.sl-app`, kept as a stable hook for tests), the time-zone context, toasts, route telemetry and the
 * `route.changed` event. Mount it as the layout route for /app (it renders <Outlet/>).
 * Rendering it twice is safe: a nested AppShell renders only the outlet.
 */
import './shell.css';
import { createContext, Suspense, useContext, useEffect, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { emit } from '../shared/events';
import { SIGNAL_LOOP_AGENT_ID } from '../shared/platform-contracts';
import { ANALYSIS_NAME, PLATFORM_NAME } from '../shared/platform';
import { tourAnchor } from '../tour/anchors';
import { TourPillSlot } from '../tour/hud/pillSlot';
import { TimezoneProvider } from '../ds/time/TimezoneContext';
import {
  Avatar,
  ButtonLink,
  Menu,
  PageSkeleton,
  ProductMark,
  Shell,
  SignalLoopGlyph,
  ToastProvider,
  Tooltip,
  useToast,
  type Crumb,
  type NavGroup,
} from '../ds';
import {
  IconBeaker,
  IconChevronsUpDown,
  IconGauge,
  IconGrid,
  IconHome,
  IconInbox,
  IconLayers,
  IconLoop,
  IconPlug,
  IconPlus,
  IconRoute,
  IconSend,
  IconSettings,
  IconSparkle,
  IconCheckCircle,
  IconUsers,
} from '../ds/icons';
import { api } from './api/client';
import { invalidate, useMe, usePeople, useReviewQueue, useSession } from './api/hooks';
import { refreshTourStateFromUrl } from './state';
import { trackPage } from './telemetry';
import { money } from './lib/labels';

const ShellCtx = createContext(false);

export const AGENT_OPS_HREF = `/ops/agents/${SIGNAL_LOOP_AGENT_ID}`;

type Section = { group: string | null; label: string; to: string; match: RegExp };

/** Breadcrumb lead for each area. Detail pages append their own crumb with useCrumbs. */
const SECTIONS: Section[] = [
  { group: null, label: 'Overview', to: '/app/overview', match: /^\/app\/overview/ },
  { group: null, label: 'Conversations', to: '/app/runs', match: /^\/app\/runs/ },
  { group: null, label: 'New conversation', to: '/app/new', match: /^\/app\/new/ },
  { group: ANALYSIS_NAME, label: 'Review', to: '/app/review', match: /^\/app\/review/ },
  { group: ANALYSIS_NAME, label: 'Insights', to: '/app/insights', match: /^\/app\/insights/ },
  { group: ANALYSIS_NAME, label: 'Themes', to: '/app/themes', match: /^\/app\/themes/ },
  { group: ANALYSIS_NAME, label: 'Routing', to: '/app/routing', match: /^\/app\/routing/ },
  { group: ANALYSIS_NAME, label: 'Deliveries', to: '/app/destinations', match: /^\/app\/destinations/ },
  { group: ANALYSIS_NAME, label: 'Close the loop', to: '/app/loop', match: /^\/app\/loop/ },
  { group: ANALYSIS_NAME, label: 'Quality', to: '/app/evals', match: /^\/app\/evals/ },
  { group: 'Workspace', label: 'Analyses', to: '/app/analyses', match: /^\/app\/analyses/ },
  { group: 'Workspace', label: 'Connections', to: '/app/connections', match: /^\/app\/connections/ },
  { group: 'Workspace', label: 'People', to: '/app/people', match: /^\/app\/people/ },
  { group: 'Workspace', label: 'Usage and health', to: '/app/health', match: /^\/app\/health/ },
  { group: 'Workspace', label: 'Settings', to: '/app/settings', match: /^\/app\/settings/ },
];

function sectionCrumb(pathname: string): Crumb[] {
  const s = SECTIONS.find((x) => x.match.test(pathname));
  if (!s) return [{ label: PLATFORM_NAME }];
  return [...(s.group ? [{ label: s.group }] : []), { label: s.label, to: s.to }];
}

function useNavGroups(): NavGroup[] {
  const review = useReviewQueue();
  const pending = review.data?.length ?? null;
  return [
    {
      items: [
        { to: '/app/overview', label: 'Overview', icon: <IconHome /> },
        { to: '/app/runs', label: 'Conversations', icon: <IconInbox /> },
      ],
    },
    {
      label: ANALYSIS_NAME,
      icon: <SignalLoopGlyph size={14} />,
      items: [
        {
          to: '/app/review',
          label: 'Review',
          icon: <IconCheckCircle />,
          badge: pending,
          badgeLabel: pending != null ? `${pending} insight${pending === 1 ? '' : 's'} waiting for review` : undefined,
          attrs: tourAnchor('nav.review'),
        },
        { to: '/app/insights', label: 'Insights', icon: <IconSparkle /> },
        { to: '/app/themes', label: 'Themes', icon: <IconLayers />, attrs: tourAnchor('nav.themes') },
        { to: '/app/routing', label: 'Routing', icon: <IconRoute />, attrs: tourAnchor('nav.routing') },
        { to: '/app/destinations', label: 'Deliveries', icon: <IconSend /> },
        { to: '/app/loop', label: 'Close the loop', icon: <IconLoop />, attrs: tourAnchor('nav.loop') },
        { to: '/app/evals', label: 'Quality', icon: <IconBeaker />, attrs: tourAnchor('nav.evals') },
      ],
    },
    {
      label: 'Workspace',
      items: [
        { to: '/app/analyses', label: 'Analyses', icon: <IconGrid /> },
        { to: '/app/connections', label: 'Connections', icon: <IconPlug /> },
        { to: '/app/people', label: 'People', icon: <IconUsers /> },
        { to: '/app/health', label: 'Usage and health', icon: <IconGauge /> },
        { to: '/app/settings', label: 'Settings', icon: <IconSettings /> },
      ],
    },
  ];
}

function Switcher() {
  const navigate = useNavigate();
  return (
    <Menu
      label="Switch product"
      placement="bottom-start"
      width={260}
      trigger={
        <button type="button" className="ds-switcher">
          <span className="ds-switcher__mark">
            <ProductMark product="switchboard" size={28} />
          </span>
          <span className="ds-switcher__text">
            <span className="ds-switcher__name">{PLATFORM_NAME}</span>
            <span className="ds-switcher__sub">Invoca Customer Success</span>
          </span>
          <IconChevronsUpDown />
        </button>
      }
      items={[
        { kind: 'label', label: 'Products' },
        { label: PLATFORM_NAME, sub: 'Conversations in, the right people out', icon: <ProductMark product="switchboard" size={20} />, checked: true, onSelect: () => navigate('/app/overview') },
        { label: 'Agent Ops', sub: 'Logs, usage and cost for every agent', icon: <ProductMark product="agent-ops" size={20} />, onSelect: () => navigate(AGENT_OPS_HREF) },
        { kind: 'separator' },
        { label: 'Back to the walkthrough hub', onSelect: () => navigate('/') },
      ]}
    />
  );
}

function UserMenu() {
  const { data: me } = useMe();
  const session = useSession();
  const people = usePeople();
  const toast = useToast();
  const navigate = useNavigate();
  const actor = me ?? session.data?.actor ?? null;
  const candidates = (people.data ?? []).filter((p) => p.active !== false && p.id !== actor?.personId).slice(0, 8);
  const switchTo = async (personId: string, name: string) => {
    try {
      await api.setMe(personId);
      invalidate('me', 'session', 'notifications', 'review');
      toast({ tone: 'success', title: `You’re now acting as ${name}`, body: 'Reviews and changes you make are recorded under this name.' });
    } catch (err) {
      toast({ tone: 'danger', title: 'Couldn’t switch user', body: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <Menu
      label="Account"
      placement="top-start"
      width={268}
      trigger={
        <button type="button" className="ds-user">
          <Avatar name={actor?.name ?? 'You'} initials={actor?.initials} size="lg" />
          <span className="ds-user__text">
            <span className="ds-user__name">{actor?.name ?? 'Loading…'}</span>
            <span className="ds-user__sub">{actor?.title ?? ' '}</span>
          </span>
          <IconChevronsUpDown />
        </button>
      }
      items={[
        { kind: 'label', label: 'Act as someone else' },
        ...candidates.map((p) => ({ label: p.name, sub: p.title, icon: <Avatar name={p.name} initials={p.initials} size="sm" />, onSelect: () => void switchTo(p.id, p.name) })),
        { kind: 'separator' as const },
        { label: 'Manage people', icon: <IconUsers />, onSelect: () => navigate('/app/people') },
        { label: 'Workspace settings', icon: <IconSettings />, onSelect: () => navigate('/app/settings') },
      ]}
    />
  );
}

/** "Live AI" with a status dot in the top bar; the budget detail is one hover away. */
function LiveStatus() {
  const { data } = useSession();
  const b = data?.budget;
  const live = b?.liveEnabled ?? true;
  const detail = b
    ? live
      ? `Live AI is on. ${money(b.spentUsd, { precise: true })} of the ${money(b.limitUsd, { precise: true })} viewer budget used across ${b.liveRuns.toLocaleString()} live runs.`
      : `The live AI budget is used up (${money(b.spentUsd, { precise: true })} of ${money(b.limitUsd, { precise: true })}). Runs replay a recorded live run at real speed.`
    : 'Checking the AI budget';
  return (
    <Tooltip label={detail} placement="bottom-end">
      <Link to="/app/health" className="sl-live" aria-label={detail} {...tourAnchor('budget.pill')}>
        <span className={`sl-live__dot${live ? '' : ' is-off'}`} aria-hidden="true" />
        {b ? (live ? 'Live AI' : 'Replay mode') : 'Live AI'}
      </Link>
    </Tooltip>
  );
}

function Footer() {
  return (
    <>
      <TourPillSlot placement="rail" />
      <Link to={AGENT_OPS_HREF} className="ds-nav-item" {...tourAnchor('nav.agentops')}>
        <ProductMark product="agent-ops" size={16} />
        <span className="ds-nav-item__label">Agent Ops</span>
      </Link>
      <UserMenu />
    </>
  );
}

function ShellInner() {
  const location = useLocation();
  const groups = useNavGroups();

  useEffect(() => {
    emit({ name: 'route.changed', path: location.pathname });
    trackPage(location.pathname);
    refreshTourStateFromUrl();
  }, [location.pathname, location.search]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <TimezoneProvider>
      <ToastProvider>
          <Shell
            className="sl-app"
            switcher={<Switcher />}
            action={
              <ButtonLink to="/app/new" variant="secondary" block className="ds-sidebar__action" icon={<IconPlus />} {...tourAnchor('nav.new')}>
                New conversation
              </ButtonLink>
            }
            groups={groups}
            footer={<Footer />}
            sectionCrumb={sectionCrumb}
            topbarEnd={
              <>
                <LiveStatus />
                <TourPillSlot placement="bar" />
              </>
            }
            mobileBrand={
              <>
                <ProductMark product="switchboard" size={22} />
                {PLATFORM_NAME}
              </>
            }
            menuAttrs={tourAnchor('nav.menu')}
          >
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </Shell>
      </ToastProvider>
    </TimezoneProvider>
  );
}

export function AppShell() {
  const nested = useContext(ShellCtx);
  if (nested) return <Outlet />;
  return (
    <ShellCtx.Provider value>
      <ShellInner />
    </ShellCtx.Provider>
  );
}

/** Sets the browser tab title for a page: "Review · Switchboard". */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · ${PLATFORM_NAME}`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

export type { ReactNode };
