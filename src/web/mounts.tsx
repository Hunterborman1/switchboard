/**
 * Mount points for the product (/app) and the platform (/ops). Each renders the owner's
 * shell when it exists; in dev, `?dev=1` (or a product that hasn't shipped routes yet)
 * falls back to the walkthrough's anchor harness so the tour can be exercised end to end.
 */
import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AppShell, PlatformShell, appRoutes, platformRoutes } from './bridge';

import { ButtonLink } from '../ds';
import { SiteBar } from '../narrative/components';

const appRoutesHaveShell = appRoutes.length === 1 && !appRoutes[0]?.path && !!appRoutes[0]?.children;
const platformRoutesHaveShell = platformRoutes.length === 1 && !platformRoutes[0]?.path && !!platformRoutes[0]?.children;

const DevHarness = import.meta.env.DEV ? lazy(() => import('../tour/dev/DevHarness')) : null;

function useDevHarness(hasRoutes: boolean): boolean {
  if (!DevHarness) return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('dev') === '1') sessionStorage.setItem('sl-dev', '1');
    if (sp.get('dev') === '0') sessionStorage.removeItem('sl-dev');
    return sessionStorage.getItem('sl-dev') === '1' || !hasRoutes;
  } catch {
    return !hasRoutes;
  }
}

function Pending({ what }: { what: string }) {
  return (
    <main className="ds-app sl-n n-page nf">
      <SiteBar />
      <div className="nf__body">
        <div className="nf__card">
          <h1 className="nf__title">{what} is being prepared.</h1>
          <p className="nf__text">This part of the build isn’t deployed yet. The presentation and the write-up are available.</p>
          <div className="nf__actions">
            <ButtonLink variant="secondary" to="/">
              Back to the start
            </ButtonLink>
          </div>
        </div>
      </div>
    </main>
  );
}

export function AppMount() {
  const dev = useDevHarness(appRoutes.length > 0);
  if (dev && DevHarness)
    return (
      <Suspense fallback={null}>
        <DevHarness area="app" />
      </Suspense>
    );
  if (!appRoutes.length) return <Pending what="The system" />;
  // appRoutes carries its own AppShell layout route; only wrap when it doesn't.
  return appRoutesHaveShell || !AppShell ? (
    <Outlet />
  ) : (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function OpsMount() {
  const dev = useDevHarness(platformRoutes.length > 0);
  if (dev && DevHarness)
    return (
      <Suspense fallback={null}>
        <DevHarness area="ops" />
      </Suspense>
    );
  if (!platformRoutes.length) return <Pending what="Agent Ops" />;
  return platformRoutesHaveShell || !PlatformShell ? (
    <Outlet />
  ) : (
    <PlatformShell>
      <Outlet />
    </PlatformShell>
  );
}
