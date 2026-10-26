import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RouteError } from '../web/RouteError';

/**
 * Product routes, mounted under /app by src/web (router basename /repo/invoca). The top
 * entry is a pathless layout route with the AppShell; if the mounting router also wraps
 * these in an AppShell, the inner one renders only its <Outlet/>.
 */
const NewCall = lazy(() => import('./pages/NewCall'));
const Runs = lazy(() => import('./pages/Runs'));
const RunView = lazy(() => import('./pages/RunView'));
const Review = lazy(() => import('./pages/Review'));
const Insights = lazy(() => import('./pages/Insights'));
const Themes = lazy(() => import('./pages/Themes'));
const ThemeDetail = lazy(() => import('./pages/ThemeDetail'));
const Routing = lazy(() => import('./pages/Routing'));
const Destinations = lazy(() => import('./pages/Destinations'));
const Loop = lazy(() => import('./pages/Loop'));
const Evals = lazy(() => import('./pages/Evals'));
const Health = lazy(() => import('./pages/Health'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Overview = lazy(() => import('./pages/Overview'));
const Connections = lazy(() => import('./pages/Connections'));
const ConnectionDetail = lazy(() => import('./pages/ConnectionDetail'));
const People = lazy(() => import('./pages/People'));
const Analyses = lazy(() => import('./pages/Analyses'));
const Claude = lazy(() => import('./pages/Claude'));

export const appChildRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/app/overview" replace /> },
  { path: 'overview', element: <Overview /> },
  { path: 'connections', element: <Connections /> },
  { path: 'connections/:id', element: <ConnectionDetail /> },
  { path: 'people', element: <People /> },
  { path: 'analyses', element: <Analyses /> },
  { path: 'claude', element: <Claude /> },
  { path: 'new', element: <NewCall /> },
  { path: 'runs', element: <Runs /> },
  { path: 'runs/:id', element: <RunView /> },
  { path: 'review', element: <Review /> },
  { path: 'review/:id', element: <Review /> },
  { path: 'insights', element: <Insights /> },
  { path: 'insights/:id', element: <Insights /> },
  { path: 'themes', element: <Themes /> },
  { path: 'themes/:id', element: <ThemeDetail /> },
  { path: 'routing', element: <Routing /> },
  { path: 'destinations', element: <Destinations /> },
  { path: 'loop', element: <Loop /> },
  { path: 'evals', element: <Evals /> },
  { path: 'health', element: <Health /> },
  { path: 'settings', element: <Settings /> },
  { path: '*', element: <NotFound /> },
];

// The pathless child boundary keeps the AppShell (rail, header) on screen when a page throws.
export const appRoutes: RouteObject[] = [{ element: <AppShell />, children: [{ errorElement: <RouteError variant="product" />, children: appChildRoutes }] }];
