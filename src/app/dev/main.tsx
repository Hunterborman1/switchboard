/**
 * DEV-ONLY standalone harness for the product UI (not part of the build). Serve with
 * `VITE_FIXTURES=1 npx vite` and open /repo/invoca/src/app/dev/index.html#/app/new.
 * Hash routing so a reload never falls through to the narrative entry.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { appRoutes } from '../routes';
import { setTourState } from '../state';

const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
if (params.get('tour') === '1') setTourState({ tourActive: true });
if (params.get('pace')) setTourState({ pace: Number(params.get('pace')) });

const router = createHashRouter([
  { path: '/', element: <Navigate to="/app/new" replace /> },
  { path: '/app', children: appRoutes },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
