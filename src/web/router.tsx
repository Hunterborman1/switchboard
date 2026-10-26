import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { Hub } from './pages/Hub';
import { Walkthrough } from './pages/Walkthrough';
import { AppMount, OpsMount } from './mounts';
import { appRoutes, platformRoutes } from './bridge';
import { ButtonLink } from '../ds';
import { SiteBar } from '../narrative/components';
import { RouteError } from './RouteError';

export const BASENAME = '/repo/invoca';

function NotFound() {
  return (
    <main className="ds-app sl-n n-page nf" data-testid="not-found">
      <SiteBar />
      <div className="nf__body">
        <div className="nf__card">
          <span className="nf__code">404</span>
          <h1 className="nf__title">There’s nothing here.</h1>
          <p className="nf__text">That page doesn’t exist. Pick up from one of these instead.</p>
          <div className="nf__actions">
            <ButtonLink variant="primary" to="/">
              Back to the start
            </ButtonLink>
            <ButtonLink variant="secondary" to="/walkthrough">
              Start the presentation
            </ButtonLink>
            <ButtonLink variant="secondary" to="/write-up">
              Read the write-up
            </ButtonLink>
          </div>
        </div>
      </div>
    </main>
  );
}

export const router = createBrowserRouter(
  [
    // The presenter view lives outside the TourProvider: it drives the main window, it isn't one.
    { path: '/presenter', lazy: async () => ({ Component: (await import('./pages/Presenter')).Presenter }), errorElement: <RouteError /> },
    {
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Hub /> },
        // Off the first-load path: loaded when opened.
        { path: 'write-up', lazy: async () => ({ Component: (await import('./pages/WriteUp')).WriteUp }) },
        { path: 'walkthrough/:part?', element: <Walkthrough /> },
        { path: 'backup/:topic?', lazy: async () => ({ Component: (await import('../narrative/backup/BackupPage')).BackupPage }) },
        { path: 'app', element: <AppMount />, errorElement: <RouteError />, children: appRoutes.length ? appRoutes : [{ path: '*', element: null }] },
        {
          path: 'ops',
          element: <OpsMount />,
          errorElement: <RouteError />,
          // A pathless child boundary keeps the Ops shell (rail) on screen when a page throws.
          children: platformRoutes.length ? [{ errorElement: <RouteError variant="product" />, children: platformRoutes }] : [{ path: '*', element: null }],
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: BASENAME },
);
