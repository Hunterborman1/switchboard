/**
 * Root of every route except the presenter view: the TourProvider plus the walkthrough
 * chrome (HUD, spotlight, rail, pause menu, checkpoint, resume pill) layered on top.
 */
import { useEffect } from 'react';
import { Outlet, useLocation, ScrollRestoration } from 'react-router-dom';
import { TourProvider, useTour } from '../tour/engine/TourProvider';
import { TourOverlay } from '../tour/engine/TourOverlay';
import { ChapterRail, Checkpoint, Hud, PauseMenu, ResumePill } from '../tour/hud/Hud';
import { refreshProductTourState, setProductTourState, trackUsage } from './bridge';

function ProductSync() {
  const tour = useTour();
  const location = useLocation();
  const active = tour.status === 'active';
  const slow = active && tour.step.pace === 'slow';
  useEffect(() => {
    setProductTourState({ tourActive: active, pace: slow ? 900 : undefined });
  }, [active, slow]);
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
  const tour = useTour();
  const location = useLocation();
  const inProduct = /^\/(app|ops)(\/|$)/.test(location.pathname);
  const onScene = location.pathname.startsWith('/walkthrough');
  return (
    <>
      <ProductSync />
      {tour.status === 'active' && (onScene || inProduct) && <Hud />}
      <TourOverlay />
      <ChapterRail />
      <PauseMenu />
      <Checkpoint />
      {inProduct && <ResumePill />}
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
