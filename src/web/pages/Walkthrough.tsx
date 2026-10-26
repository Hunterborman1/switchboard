/**
 * /walkthrough/:part — narrative scenes, with the persistent chapter rail on the left (wide
 * screens) or the top bar's chapter menu (narrower). The engine owns which step is current; this page
 * renders the scene for it, and on a direct visit (deep link without ?tour) starts the
 * tour at that part.
 *
 * The scene chrome (top bar, bottom bar, the rail) stays mounted between scenes and never
 * re-animates; only the stage cross-fades: the outgoing and incoming stage share one grid cell
 * for 180 ms, so there is never a blank frame. Each scene then runs its own entrance once.
 */
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Skeleton } from '../../ds';
import { Scene, SceneTopBar } from '../../narrative/Scene';
import { SCENES } from '../../narrative/scenes';
import { useCalm } from '../../narrative/hooks';
import { chapterById, CHAPTERS, GROUPS } from '../../tour/script/chapters';
import { firstStepOf, FIRST_STEP } from '../../tour/script/steps';
import { useTour } from '../../tour/engine/TourProvider';
import { ChapterRailNav } from '../../tour/hud/Hud';
import type { ChapterId } from '../../tour/engine/types';

/** Shown while the engine aligns with a deep link: the scene chrome and a placeholder the shape of a scene head. */
function SceneSkeleton() {
  return (
    <main className="ds-app sl-n n-page n-deck">
      <ChapterRailNav />
      <section className="n-scene" aria-busy="true" aria-label="Loading the walkthrough" data-testid="scene-skeleton">
        <SceneTopBar />
        <div className="n-scene__body">
          <div className="n-scene__skeleton">
            <Skeleton width="56%" height={40} radius={6} />
            <Skeleton width="72%" height={16} />
            <Skeleton width="100%" height={280} radius={8} style={{ marginTop: 24 }} />
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
  const alignedRef = useRef(false);

  // Direct visit: align the engine with the URL (only when the URL part changes).
  useEffect(() => {
    const valid = part && CHAPTERS.some((c) => c.id === part);
    const want = valid ? firstStepOf(part as ChapterId) : FIRST_STEP;
    const cur = stepRef.current;
    if (statusRef.current !== 'active') {
      if (cur.chapter === (part ?? 'signal') && cur.kind === 'scene') tour.resume();
      else tour.goto(want, { replace: true });
      return;
    }
    if (valid && cur.chapter !== part) tour.goto(want, { replace: true });
    else if (!part) tour.goto(FIRST_STEP, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part]);

  const step = tour.step;
  // On a deep link the engine still holds the previous (or first) step for a frame: show the
  // skeleton until it matches the URL, so the wrong scene never flashes. Once aligned, moving
  // between scenes changes the step before the URL, and the page keeps drawing the step.
  const wantChapter = part && CHAPTERS.some((c) => c.id === part) ? part : CHAPTERS[0]!.id;
  if (step.chapter === wantChapter) alignedRef.current = true;
  if (step.kind !== 'scene' || !step.scene || !alignedRef.current) return <SceneSkeleton />;
  const def = SCENES[step.scene];
  const ch = chapterById(step.chapter);
  const C = def.component;
  return (
    <main className="ds-app sl-n n-page n-deck" data-scene={step.scene}>
      <ChapterRailNav />
      <Scene
        label={ch.title}
        group={GROUPS.find((g) => g.ids.includes(ch.id))?.label}
        index={ch.part}
        total={CHAPTERS.length}
        progress={tour.progress}
        onNext={def.bare ? undefined : () => tour.next()}
        onBack={tour.canGoBack ? tour.back : undefined}
        nextLabel={def.exitLabel ?? 'Next'}
        bare={def.bare}
        testId={`scene-${step.scene}`}
      >
        {/* No initial={false} here: it would also block every part's entrance on the first scene
            after the hub, a deep link or the product. The first scene fades in like the rest. */}
        <AnimatePresence>
          <motion.div
            key={step.id}
            className="n-scene__stage"
            initial={calm ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, pointerEvents: 'none', transition: { duration: calm ? 0 : 0.18, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: calm ? 0 : 0.18, ease: [0.2, 0, 0, 1] }}
          >
            <C />
          </motion.div>
        </AnimatePresence>
      </Scene>
    </main>
  );
}

export default Walkthrough;
