/**
 * / — the landing page. "Every call is a signal." What Switchboard is, the analysis built for
 * this brief, and three ways in: the guided walkthrough, the product itself, and the write-up.
 */
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Button, ButtonLink } from '../../ds';
import { IconArrowRight, IconBook, IconGrid, IconPlay } from '../../ds/icons';
import { SiteBar } from '../../narrative/components';
import { useCalm } from '../../narrative/hooks';
import { DUR, EASE } from '../../narrative/motion';
import { useTour } from '../../tour/engine/TourProvider';
import { BACKUPS, PRODUCT_CHAPTERS, TOTAL_TARGET_SEC, chapterById } from '../../tour/script/chapters';

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function DoorInner({ icon, title, body, meta, cta, primary }: { icon: ReactNode; title: string; body: string; meta: string; cta: string; primary?: boolean }) {
  return (
    <>
      <span className="hub-door__icon" data-primary={primary ? 'true' : undefined} aria-hidden="true">
        {icon}
      </span>
      <span className="hub-door__title">{title}</span>
      <span className="hub-door__body">{body}</span>
      <span className="hub-door__foot">
        <span className="hub-door__meta">{meta}</span>
        <span className="hub-door__go">
          {cta}
          <IconArrowRight size={16} />
        </span>
      </span>
    </>
  );
}

export function Hub() {
  const tour = useTour();
  const navigate = useNavigate();
  const calm = useCalm();
  const resumable = tour.status !== 'idle' && !tour.finished && tour.step.id !== 'cold-open';

  const startTour = () => {
    tour.start();
    navigate('/walkthrough/cold-open');
  };
  const resumeTour = () => tour.resume();
  const explore = () => {
    if (tour.status === 'active') tour.exit();
    navigate('/app/overview');
  };
  const enter = (i: number) => ({ initial: calm ? false : { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : i * 0.06 } }) as const;
  const chapters = NUMBER_WORDS[PRODUCT_CHAPTERS] ?? String(PRODUCT_CHAPTERS);

  return (
    <main className="ds-app sl-n n-page hub" data-testid="hub">
      <SiteBar>
        <ButtonLink variant="ghost" size="sm" to="/presenter" target="_blank" rel="noopener" className="hub__presenter">
          Presenter view
        </ButtonLink>
        <ButtonLink variant="secondary" size="sm" to="/ops">
          Agent Ops
        </ButtonLink>
      </SiteBar>

      <div className="hub__col">
        <motion.section className="hub__hero" {...enter(0)}>
          <p className="hub__kicker">AI Operations Lead brief, option 3: the feedback loop</p>
          <h1 className="n-display hub__title">Every call is a signal.</h1>
          <p className="n-lede hub__lede">
            Switchboard reads any customer conversation, from a recorded call to an email thread or a PDF, works out what it is, and sends what matters to the right people in the tools they already use. Signal Loop is the analysis built for this brief: product feedback, proved with the customer’s own words, sent to its owner.
          </p>
        </motion.section>

        {resumable && (
          <motion.div className="hub__resume" {...enter(1)}>
            <span className="hub__resume-text">
              Walkthrough in progress: <b>{chapterById(tour.step.chapter).title}</b>
            </span>
            <Button variant="secondary" size="sm" icon={<IconPlay size={14} />} onClick={resumeTour}>
              Resume where you left off
            </Button>
          </motion.div>
        )}

        <section className="hub__doors" aria-label="Choose how to begin">
          <motion.div {...enter(2)} className="hub__doorwrap">
            <button type="button" className="hub-door hub-door--primary" onClick={startTour} data-testid="door-walkthrough">
              <DoorInner
                primary
                icon={<IconPlay size={18} />}
                title="Start the walkthrough"
                body={`The story first, then you use the real product across ${chapters} short chapters.`}
                meta={`About ${Math.round(TOTAL_TARGET_SEC / 60)} minutes`}
                cta="Start"
              />
            </button>
          </motion.div>
          <motion.div {...enter(3)} className="hub__doorwrap">
            <button type="button" className="hub-door" onClick={explore} data-testid="door-explore">
              <DoorInner icon={<IconGrid size={18} />} title="Open the product" body="Bring in any conversation, review what it found, change who hears what, and check the quality tests." meta="Explore on your own" cta="Open" />
            </button>
          </motion.div>
          <motion.div {...enter(4)} className="hub__doorwrap">
            <Link className="hub-door" to="/write-up" data-testid="door-writeup">
              <DoorInner icon={<IconBook size={18} />} title="Read the write-up" body="The problem, the platform, the rollout and what comes next, on one page." meta="About 8 minutes to read" cta="Read" />
            </Link>
          </motion.div>
        </section>

        <footer className="hub__foot">
          <p className="hub__note">Sample data only. Every account is fictional, connectors are simulated, and every panel says whether it is live or simulated.</p>
          <nav className="hub__backups" aria-label="Questions and answers">
            <span className="hub__backups-k">Questions</span>
            {BACKUPS.map((b) => (
              <Link key={b.topic} className="n-link" to={`/backup/${b.topic}`}>
                {b.title}
              </Link>
            ))}
          </nav>
          <a className="n-link hub__md" href={`${import.meta.env.BASE_URL}walkthrough.md`} data-testid="hub-markdown">
            Markdown version for AI assistants
          </a>
        </footer>
      </div>
    </main>
  );
}

export default Hub;
