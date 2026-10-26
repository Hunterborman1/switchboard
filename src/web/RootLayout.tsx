/**
 * Root of every route except the presenter view: the TourProvider plus the presentation chrome.
 * Product pages (/app, /ops) get the Guide, one persistent box for presenting and exploring;
 * scenes get their chapter rail (rendered by the Walkthrough page), the top bar's tools and the
 * narrow chapter menu.
 */
import { useEffect } from 'react';
import { Outlet, useLocation, ScrollRestoration } from 'react-router-dom';
import { TourProvider, useTour } from '../tour/engine/TourProvider';
import { Guide } from '../tour/guide/Guide';
import { ChapterDrawer, SceneTools } from '../tour/hud/Hud';
import { refreshProductTourState, setProductTourState, trackUsage } from './bridge';

function ProductSync() {
  const tour = useTour();
  const location = useLocation();
  const active = tour.status === 'active';
  useEffect(() => {
    // The product reveals runs at their real speed: the presentation never asks it to slow down.
    setProductTourState({ tourActive: active, pace: undefined });
  }, [active]);
  useEffect(() => {
    refreshProductTourState();
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (active) trackUsage('tour_step', { stepId: tour.step.id, chapter: tour.step.chapter, path: tour.ctx.path });
  }, [active, tour.step.id, tour.step.chapter, tour.ctx.path]);
  useEffect(() => {
    if (tour.finished) trackUsage('tour_complete', { explored: tour.ctx.explored.length });
  }, [tour.finished, tour.ctx.explored.length]);
  return null;
}

function Chrome() {
  const location = useLocation();
  const onScene = location.pathname.startsWith('/walkthrough');
  return (
    <>
      <ProductSync />
      {onScene && <SceneTools />}
      {onScene && <ChapterDrawer />}
      <Guide />
    </>
  );
}

export function RootLayout() {
  return (
    <TourProvider>
      <Outlet />
      <Chrome />
      <ScrollRestoration />
    </TourProvider>
  );
}
