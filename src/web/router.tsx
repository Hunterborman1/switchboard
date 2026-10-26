import { createBrowserRouter } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { Hub } from './pages/Hub';
import { Walkthrough } from './pages/Walkthrough';
import { AppMount, OpsMount } from './mounts';
import { appRoutes, platformRoutes } from './bridge';
import { NotFound } from './NotFound';
import { RouteError } from './RouteError';

export const BASENAME = '/repo/invoca';

export const router = createBrowserRouter(
  [
    // The presenter view lives outside the TourProvider: it drives the main window, it isn't one.
    { path: '/presenter', lazy: async () => ({ Component: (await import('./pages/Presenter')).Presenter }), errorElement: <RouteError /> },
    {
      element: <RootLayout />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Hub /> },
        // The read-through pages (src/web/pages/writeup), off the first-load path: loaded when
        // opened. The write-up is one page per chapter; the Q&A one page per topic.
        { path: 'write-up', lazy: async () => ({ Component: (await import('./pages/writeup/WriteUpIndex')).WriteUpIndex }) },
        { path: 'write-up/:chapter', lazy: async () => ({ Component: (await import('./pages/writeup/WriteUpChapter')).WriteUpChapter }) },
        { path: 'backup/:topic?', lazy: async () => ({ Component: (await import('./pages/writeup/QuestionPage')).QuestionPage }) },
        { path: 'walkthrough/:part?', element: <Walkthrough /> },
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
