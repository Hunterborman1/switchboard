/**
 * Agent Ops UI entry. Mounted under /ops by src/web/router.tsx (via src/web/bridge.ts):
 *   { path: 'ops', element: <PlatformShell><Outlet/></PlatformShell>, children: platformRoutes }
 * Routes are relative children; PlatformShell is the layout.
 *
 * Only a real agent opens: pages that take `?agentId=` sit behind AgentFilterGuard, and the
 * agent and trace pages send a simulated agent's URL back to their list (see canOpenAgent).
 */
import { createElement, type ComponentType } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
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
import { AgentFilterGuard } from './ui/kit';

export { PlatformShell } from './PlatformShell';

const guarded = (page: ComponentType) => createElement(AgentFilterGuard, null, createElement(page));

export const platformRoutes: RouteObject[] = [
  { index: true, element: createElement(Overview) },
  { path: 'summary', element: createElement(ExecSummary) },
  { path: 'agents', element: createElement(Registry) },
  { path: 'agents/:id', element: createElement(AgentDetail) },
  { path: 'usage', element: guarded(Usage) },
  { path: 'logs', element: guarded(Logs) },
  { path: 'traces/:traceId', element: createElement(Trace) },
  { path: 'reliability', element: guarded(Reliability) },
  { path: 'cost', element: createElement(Cost) },
  { path: 'runbook', element: createElement(Runbook) },
  // Per-agent runbooks were only ever the simulated agent's; old links land on the registry.
  { path: 'runbook/:doc', element: createElement(Navigate, { to: '/ops/agents', replace: true }) },
  { path: 'standard', element: createElement(Standard) },
  { path: 'standard/reviews', element: createElement(Standard) },
  { path: 'standard/checklist', element: createElement(Standard) },
  { path: '*', element: createElement(Overview) },
];
