/**
 * Agent Ops UI entry. Mounted under /ops by src/web/router.tsx (via src/web/bridge.ts):
 *   { path: 'ops', element: <PlatformShell><Outlet/></PlatformShell>, children: platformRoutes }
 * Routes are relative children; PlatformShell is the layout.
 */
import { createElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import { AgentDetail } from './pages/AgentDetail';
import { Cost } from './pages/Cost';
import { ExecSummary } from './pages/ExecSummary';
import { Logs } from './pages/Logs';
import { Overview } from './pages/Overview';
import { Registry } from './pages/Registry';
import { Reliability } from './pages/Reliability';
import { Runbook } from './pages/Runbook';
import { Standard } from './pages/Standard';
import { Trace } from './pages/Trace';
import { Usage } from './pages/Usage';

export { PlatformShell } from './PlatformShell';

export const platformRoutes: RouteObject[] = [
  { index: true, element: createElement(Overview) },
  { path: 'summary', element: createElement(ExecSummary) },
  { path: 'agents', element: createElement(Registry) },
  { path: 'agents/:id', element: createElement(AgentDetail) },
  { path: 'usage', element: createElement(Usage) },
  { path: 'logs', element: createElement(Logs) },
  { path: 'traces/:traceId', element: createElement(Trace) },
  { path: 'reliability', element: createElement(Reliability) },
  { path: 'cost', element: createElement(Cost) },
  { path: 'runbook', element: createElement(Runbook) },
  { path: 'standard', element: createElement(Standard) },
  { path: 'standard/reviews', element: createElement(Standard) },
  { path: 'standard/checklist', element: createElement(Standard) },
  { path: '*', element: createElement(Overview) },
];
