import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'motion/react';

// Self-hosted fonts (no third-party font requests from the narrative layer).
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/inter-tight/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/inter/wght.css';

import '../narrative/narrative.css';
import '../narrative/scenes/scenes.css';
import '../tour/tour.css';
import './web.css';

import { router } from './router';
import { reloadOnce } from './RouteError';

// Deploy skew: a lazy chunk from the previous build is gone (the Worker 404s it). Reload once
// per session onto the new build instead of surfacing an error.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault();
});
// Clear the one-shot guard once this build has stayed up for a while, so a later deploy can reload again.
window.setTimeout(() => {
  try {
    sessionStorage.removeItem('sl-chunk-reload');
  } catch {
    /* storage unavailable */
  }
}, 30_000);

const forcedCalm = new URLSearchParams(window.location.search).get('motion') === 'reduced';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion={forcedCalm ? 'always' : 'user'}>
      <RouterProvider router={router} />
    </MotionConfig>
  </StrictMode>,
);
