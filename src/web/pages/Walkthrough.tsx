/**
 * /walkthrough/:part — narrative scenes. The engine owns which step is current; this page
 * renders the scene for it, and on a direct visit (deep link without ?tour) starts the
 * tour at that part.
 *
 * The scene chrome (top bar, footer) stays put between scenes; only the stage cross-fades,
 * with a short exit so the presenter never waits on a blank screen.
 */
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Scene } from '../../narrative/Scene';
import { SCENES } from '../../narrative/scenes';
import { useCalm } from '../../narrative/hooks';
import { Backdrop, LoopGlyph, Mark } from '../../narrative/components';
import { chapterById, CHAPTERS } from '../../tour/script/chapters';
import { firstStepOf, FIRST_STEP } from '../../tour/script/steps';
import { useTour } from '../../tour/engine/TourProvider';
import type { ChapterId } from '../../tour/engine/types';

/** Shown while the engine aligns with a deep link: the scene chrome and a breathing glyph, never a blank screen. */
function SceneSkeleton() {
  const calm = useCalm();
  return (
    <main className="sl-n n-page">
      <section className="n-scene" aria-busy="true" aria-label="Loading the walkthrough" data-testid="scene-skeleton">
        <Backdrop />
        <header className="n-scene__top">
          <Mark href={`${import.meta.env.BASE_URL}`} />
        </header>
        <div className="n-scene__body">
          <div className="n-scene__skeleton">
            <LoopGlyph size={44} live={!calm} />
            <span className="n-label">Loading</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export function Walkthrough() {
  const { part } = useParams();
  const tour = useTour();
  const calm = useCalm();
  const stepRef = useRef(tour.step);
  stepRef.current = tour.step;
  const statusRef = useRef(tour.status);
  statusRef.current = tour.status;

  // Direct visit: align the engine with the URL (only when the URL part changes).
  useEffect(() => {
    const valid = part && CHAPTERS.some((c) => c.id === part);
    const want = valid ? firstStepOf(part as ChapterId) : FIRST_STEP;
    const cur = stepRef.current;
    if (statusRef.current !== 'active') {
      if (cur.chapter === (part ?? 'cold-open') && cur.kind === 'scene') tour.resume();
      else tour.goto(want, { replace: true });
      return;
    }
    if (valid && cur.chapter !== part) tour.goto(want, { replace: true });
    else if (!part) tour.goto(FIRST_STEP, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part]);

  const step = tour.step;
  if (step.kind !== 'scene' || !step.scene) return <SceneSkeleton />;
  const def = SCENES[step.scene];
  const ch = chapterById(step.chapter);
  const beats = step.beats ?? 1;
  const last = tour.beat >= beats - 1;
  const C = def.component;
  return (
    <main className="sl-n n-page" data-scene={step.scene}>
      <Scene
        num={String(ch.part).padStart(2, '0')}
        label={ch.title}
        beat={tour.beat}
        beats={beats}
        onNext={def.bare ? undefined : () => tour.next()}
        onBack={tour.canGoBack ? tour.back : undefined}
        nextLabel={last ? def.exitLabel ?? 'Continue' : 'Next'}
        bare={def.bare}
        testId={`scene-${step.scene}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.id}
            className="n-scene__stage"
            initial={calm ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.18, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: calm ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <C beat={tour.beat} beats={beats} />
          </motion.div>
        </AnimatePresence>
      </Scene>
    </main>
  );
}

export default Walkthrough;
