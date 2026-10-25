/**
 * The Signal Loop product shell: the UIS ConsoleShell (collapsible dark rail, mobile drawer,
 * nav badges) on the Invoca-themed HB tokens. Owns the product theme scope (`.sl-app`), the
 * timezone context, toasts, route telemetry and the `route.changed` event.
 *
 * Mount it as the layout route for /app (it renders <Outlet/>). Rendering it twice is safe:
 * a nested AppShell detects its parent and renders only the outlet.
 */
import '../theme/invoca.css';
import '../uis/uis.css';
import './app.css';
import './shell.css';
import { createContext, Suspense, useContext, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { emit } from '../shared/events';
import { SIGNAL_LOOP_AGENT_ID } from '../shared/platform-contracts';
import { tourAnchor } from '../tour/anchors';
import { ProductMark, ProductSwitcher } from '../uis/ProductSwitcher';
import { ConsoleShell, type ConsoleNavGroup } from '../uis/ConsoleShell';
import { TimezoneProvider } from '../uis/TimezoneContext';
import { PageHeaderSkeleton, SkeletonSurface, TableSkeleton } from '../uis/Skeleton';
import { useReviewQueue, useSession } from './api/hooks';
import { ToastProvider } from './components/ui';
import { Hint } from './components/Hint';
import {
  IconBeaker,
  IconChannels,
  IconGauge,
  IconLoop,
  IconOps,
  IconReview,
  IconRoute,
  IconRuns,
  IconSliders,
  IconSpark,
  IconTheme,
  IconUpload,
} from './components/icons';
import { refreshTourStateFromUrl } from './state';
import { trackPage } from './telemetry';
import { TourPillSlot } from '../tour/hud/pillSlot';

const ShellCtx = createContext(false);

export const AGENT_OPS_HREF = `/ops/agents/${SIGNAL_LOOP_AGENT_ID}`;

function useNavGroups(): ConsoleNavGroup[] {
  const review = useReviewQueue();
  const pending = review.data?.length ?? null;
  return [
    {
      label: 'Capture',
      items: [
        { to: '/app/new', label: 'New call', icon: <IconUpload />, attrs: tourAnchor('nav.new') },
        { to: '/app/runs', label: 'Runs', icon: <IconRuns /> },
        {
          to: '/app/review',
          label: 'Review queue',
          icon: <IconReview />,
          badge: pending,
          badgeLabel: pending != null ? `${pending} insight${pending === 1 ? '' : 's'} waiting for a human` : undefined,
          attrs: tourAnchor('nav.review'),
        },
        { to: '/app/insights', label: 'Insights', icon: <IconSpark /> },
      ],
    },
    {
      label: 'Route and follow up',
      items: [
        { to: '/app/routing', label: 'Routing', icon: <IconRoute />, attrs: tourAnchor('nav.routing') },
        { to: '/app/destinations', label: 'Destinations', icon: <IconChannels /> },
        { to: '/app/themes', label: 'Themes', icon: <IconTheme />, attrs: tourAnchor('nav.themes') },
        { to: '/app/loop', label: 'CSM loop', icon: <IconLoop />, attrs: tourAnchor('nav.loop') },
      ],
    },
    {
      label: 'Prove it',
      items: [
        { to: '/app/evals', label: 'Evals', icon: <IconBeaker />, attrs: tourAnchor('nav.evals') },
        { to: '/app/health', label: 'Health & cost', icon: <IconGauge /> },
        { to: '/app/settings', label: 'Settings', icon: <IconSliders /> },
      ],
    },
  ];
}

function Footer({ collapsed }: { collapsed: boolean }) {
  const { data } = useSession();
  const ws = data?.workspaceId;
  return (
    <div className={`sl-footer${collapsed ? ' is-collapsed' : ''}`}>
      <TourPillSlot placement="rail" compact={collapsed} />
      {collapsed ? (
        <Hint label="Agent Ops: logs, traces, usage and cost for every agent" placement="right">
          <Link to={AGENT_OPS_HREF} className="sl-footer-item is-icon" {...tourAnchor('nav.agentops')} aria-label="Open Agent Ops">
            <IconOps size={16} />
          </Link>
        </Hint>
      ) : (
        <Hint label={ws ? `Workspace ${ws}. Your edits stay in this workspace and never change anyone else's view.` : 'Your edits stay in your own workspace.'} placement="right">
          <div className="sl-footer-ws" tabIndex={0}>
            <span className="sl-footer-dot" aria-hidden="true" />
            <span className="sl-footer-ws-text">
              Your workspace
              <small>Changes stay private to you</small>
            </span>
          </div>
        </Hint>
      )}
    </div>
  );
}

function RouteFallback() {
  return (
    <SkeletonSurface label="Loading page">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </SkeletonSurface>
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
    <div className="sl-app">
      <a href="#main-content" className="sl-skip">
        Skip to content
      </a>
      <TimezoneProvider>
        <ToastProvider>
          <ConsoleShell
            storageKey="sl-rail-collapsed"
            brand={
              <ProductSwitcher
                current="signal-loop"
                caption="Prepared for Invoca"
                hrefs={{ 'signal-loop': '/app/new', 'agent-ops': AGENT_OPS_HREF }}
                otherAttrs={tourAnchor('nav.agentops')}
              />
            }
            brandCollapsed={
              <span className="sl-mobile-brand" title="Signal Loop">
                <ProductMark product="signal-loop" size={24} />
              </span>
            }
            mobileBrand={
              <span className="sl-mobile-brand">
                <ProductMark product="signal-loop" size={20} />
                Signal Loop
              </span>
            }
            groups={groups}
            footer={<Footer collapsed={false} />}
            footerCollapsed={<Footer collapsed />}
            mobileBarEnd={<TourPillSlot placement="bar" />}
          >
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </ConsoleShell>
        </ToastProvider>
      </TimezoneProvider>
    </div>
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
