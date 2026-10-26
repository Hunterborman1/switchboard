/**
 * / — the landing page. "Every call is a signal." Three options: the guided walkthrough, the
 * product itself, and the write-up. Same light, flat language as the product.
 */
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Arrow, Mark } from '../../narrative/components';
import { useCalm } from '../../narrative/hooks';
import { DUR, EASE } from '../../narrative/motion';
import { useTour } from '../../tour/engine/TourProvider';
import { BACKUPS, TOTAL_TARGET_SEC, chapterById } from '../../tour/script/chapters';

const icon = (d: string) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

function Door({ k, title, body, meta, cta, primary, children }: { k: string; title: string; body: string; meta: string; cta: string; primary?: boolean; children: (inner: ReactNode) => ReactNode }) {
  const inner = (
    <>
      <span className="hub-door__icon" data-primary={primary ? 'true' : undefined}>
        {k === 'walkthrough' ? icon('M8 5.5v13l10-6.5z') : k === 'explore' ? icon('M4 6h16M4 12h16M4 18h10') : icon('M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4')}
      </span>
      <span className="hub-door__title">{title}</span>
      <span className="hub-door__body">{body}</span>
      <span className="hub-door__foot">
        <span className="hub-door__meta">{meta}</span>
        <span className="hub-door__go">
          {cta} <Arrow />
        </span>
      </span>
    </>
  );
  return <>{children(inner)}</>;
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
    navigate('/app/new');
  };
  const enter = (i: number) => ({ initial: calm ? false : { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : i * 0.06 } }) as const;

  return (
    <main className="sl-n n-page hub" data-testid="hub">
      <header className="hub__top">
        <div className="hub__topin">
          <Mark sub="Prepared for Invoca" />
          <nav className="hub__nav" aria-label="Secondary">
            <Link className="n-btn n-btn--quiet n-btn--sm" to="/presenter" target="_blank" rel="noopener">
              Presenter view
            </Link>
            <Link className="n-btn n-btn--ghost n-btn--sm" to="/ops">
              Agent Ops
            </Link>
          </nav>
        </div>
      </header>

      <div className="hub__col">
        <motion.section className="hub__hero" {...enter(0)}>
          <p className="hub__kicker">AI Operations Lead · Option 3, the feedback loop</p>
          <h1 className="n-display n-display--lg">Every call is a signal.</h1>
          <p className="n-lede">
            Signal Loop turns what customers tell Invoca’s CSMs into product insight with the quote attached, sent to the person who can act on it. It runs inside Agent Ops, where every agent has an owner, a cost and a measured return.
          </p>
        </motion.section>

        {resumable && (
          <motion.div className="hub__resume" {...enter(1)}>
            <span>
              Walkthrough in progress: <b>{chapterById(tour.step.chapter).title}</b>
            </span>
            <button className="n-btn n-btn--ghost n-btn--sm" onClick={resumeTour}>
              Resume where you left off <Arrow />
            </button>
          </motion.div>
        )}

        <section className="hub__doors" aria-label="Choose how to begin">
          <motion.div {...enter(2)} className="hub__doorwrap">
            <Door k="walkthrough" primary title="Start the walkthrough" body="The story first, then you use the real product across eight short chapters." meta={`About ${Math.round(TOTAL_TARGET_SEC / 60)} minutes`} cta="Start">
              {(inner) => (
                <button className="hub-door hub-door--primary" onClick={startTour} data-testid="door-walkthrough">
                  {inner}
                </button>
              )}
            </Door>
          </motion.div>
          <motion.div {...enter(3)} className="hub__doorwrap">
            <Door k="explore" title="Open the product" body="Run any of 48 sample calls, review what it found, change who hears what, and check the quality tests." meta="Explore on your own" cta="Open">
              {(inner) => (
                <button className="hub-door" onClick={explore} data-testid="door-explore">
                  {inner}
                </button>
              )}
            </Door>
          </motion.div>
          <motion.div {...enter(4)} className="hub__doorwrap">
            <Door k="writeup" title="Read the write-up" body="The problem, the system, the rollout and what comes next, on one page." meta="About 8 minutes to read" cta="Read">
              {(inner) => (
                <Link className="hub-door" to="/write-up" data-testid="door-writeup">
                  {inner}
                </Link>
              )}
            </Door>
          </motion.div>
        </section>

        <footer className="hub__foot">
          <span>Sample data only. Every account is fictional and every panel says whether it is live or simulated.</span>
          <nav className="hub__backups" aria-label="Q&A topics">
            <span>Questions:</span>
            {BACKUPS.map((b) => (
              <Link key={b.topic} className="n-link" to={`/backup/${b.topic}`}>
                {b.title}
              </Link>
            ))}
          </nav>
          <a className="n-link" href={`${import.meta.env.BASE_URL}walkthrough.md`} style={{ justifySelf: 'start', fontSize: 'var(--n-text-sm)' }} data-testid="hub-markdown">
            Markdown version for AI assistants
          </a>
        </footer>
      </div>
    </main>
  );
}

export default Hub;
