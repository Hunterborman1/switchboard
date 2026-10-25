import { createBrowserRouter, Link } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { Hub } from './pages/Hub';
import { Walkthrough } from './pages/Walkthrough';
import { Presenter } from './pages/Presenter';
import { WriteUp } from './pages/WriteUp';
import { BackupPage } from '../narrative/backup/BackupPage';
import { AppMount, OpsMount } from './mounts';
import { appRoutes, platformRoutes } from './bridge';
import { Backdrop, Display, Lede } from '../narrative/components';

export const BASENAME = '/repo/invoca';

function NotFound() {
  return (
    <main className="sl-n n-page nf">
      <Backdrop />
      <div className="n-stack" style={{ justifyItems: 'center' }}>
        <span className="n-label">404</span>
        <Display size="md">
          No signal <em>here.</em>
        </Display>
        <Lede>That page doesn’t exist.</Lede>
        <Link className="n-btn n-btn--primary" to="/">
          Back to the hub
        </Link>
      </div>
    </main>
  );
}

export const router = createBrowserRouter(
  [
    // The presenter view lives outside the TourProvider: it drives the main window, it isn't one.
    { path: '/presenter', element: <Presenter /> },
    {
      element: <RootLayout />,
      children: [
        { index: true, element: <Hub /> },
        { path: 'write-up', element: <WriteUp /> },
        { path: 'walkthrough/:part?', element: <Walkthrough /> },
        { path: 'backup/:topic?', element: <BackupPage /> },
        { path: 'app', element: <AppMount />, children: appRoutes.length ? appRoutes : [{ path: '*', element: null }] },
        { path: 'ops', element: <OpsMount />, children: platformRoutes.length ? platformRoutes : [{ path: '*', element: null }] },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: BASENAME },
);
