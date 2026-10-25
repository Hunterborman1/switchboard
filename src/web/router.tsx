import { createBrowserRouter, Link } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { Hub } from './pages/Hub';
import { Walkthrough } from './pages/Walkthrough';
import { Presenter } from './pages/Presenter';
import { WriteUp } from './pages/WriteUp';
import { BackupPage } from '../narrative/backup/BackupPage';
import { AppMount, OpsMount } from './mounts';
import { appRoutes, platformRoutes } from './bridge';
import { Display, Lede } from '../narrative/components';
import { SceneTopBar } from '../narrative/Scene';
import { RouteError } from './RouteError';

export const BASENAME = '/repo/invoca';

function NotFound() {
  return (
    <main className="sl-n n-page nf">
      <SceneTopBar />
      <div className="nf__body">
        <div className="nf__card">
          <span className="n-label">Page not found</span>
          <Display size="md">There’s nothing here.</Display>
          <Lede>That page doesn’t exist. Pick up from one of these instead.</Lede>
          <div className="nf__actions">
            <Link className="n-btn n-btn--primary" to="/">
              Back to the start
            </Link>
            <Link className="n-btn" to="/walkthrough">
              Start the walkthrough
            </Link>
            <Link className="n-btn" to="/write-up">
              Read the write-up
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export const router = createBrowserRouter(
  [
    // The presenter view lives outside the TourProvider: it drives the main window, it isn't one.
    { path: '/presenter', element: <Presenter />, errorElement: <RouteError /> },
    {
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Hub /> },
        { path: 'write-up', element: <WriteUp /> },
        { path: 'walkthrough/:part?', element: <Walkthrough /> },
        { path: 'backup/:topic?', element: <BackupPage /> },
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
