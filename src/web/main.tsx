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

const forcedCalm = new URLSearchParams(window.location.search).get('motion') === 'reduced';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion={forcedCalm ? 'always' : 'user'}>
      <RouterProvider router={router} />
    </MotionConfig>
  </StrictMode>,
);
