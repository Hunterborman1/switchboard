import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom';
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

/**
 * The Q&A used to be pages of their own. It is now part of the write-up, one section per topic
 * (#cost, #security, …), so /backup/:topic (old links, the presenter's "jump to backup") lands
 * on that section. The write-up scrolls to the anchor once it renders.
 */
function BackupRedirect() {
  const { topic } = useParams();
  const { search } = useLocation();
  return <Navigate replace to={{ pathname: '/write-up', search, hash: topic ?? 'questions' }} />;
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
        { path: 'backup/:topic?', element: <BackupRedirect /> },
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
