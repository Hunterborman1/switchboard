/**
 * / — the cover. "Every call is a signal." Three doors: the guided walkthrough, the system
 * itself, and the write-up.
 */
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Arrow, Backdrop, Chip, Display, Lede, Mark, Reveal } from '../../narrative/components';
import { Waveform } from '../../narrative/scenes/ColdOpen';
import { useCalm } from '../../narrative/hooks';
import { useTour } from '../../tour/engine/TourProvider';
import { BACKUPS, TOTAL_TARGET_SEC, chapterById } from '../../tour/script/chapters';

const ROLE = [
  { k: 'Build agents', v: 'Signal Loop: a real pipeline with grounding, gates, review and routing.' },
  { k: 'Own the platform', v: 'Agent Ops: registry, usage, logs, traces, SLOs and cost for every agent.' },
  { k: 'Raise the bar', v: 'A nine-check agent standard, applied to my own build first.' },
  { k: 'Report impact', v: 'Hours returned and value against AI cost, with the assumptions labelled.' },
];

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

  return (
    <main className="sl-n n-page hub" data-testid="hub">
      <Backdrop />
      <div className="hub__wave" aria-hidden="true">
        <Waveform resolved={false} bars={96} height={320} />
      </div>
      <header className="hub__top">
        <Mark />
        <nav className="hub__nav" aria-label="Secondary">
          <Link className="n-link" to="/presenter" target="_blank" rel="noopener">
            Presenter view
          </Link>
          <Link className="n-link" to="/ops">
            Agent Ops
          </Link>
        </nav>
      </header>
      <section className="hub__hero">
        <Reveal className="n-stack--lg n-stack" delay={0.1} each={0.11}>
          <Reveal.Item>
            <span className="n-eyebrow">
              <span className="n-eyebrow__num">AI Operations Lead</span>
              <span className="n-eyebrow__rule" />
              <span>Final round · Option 3, the feedback loop</span>
            </span>
          </Reveal.Item>
          <Reveal.Item>
            <Display size="xl">
              Every call is a <em>signal.</em>
            </Display>
          </Reveal.Item>
          <Reveal.Item>
            <Lede>
              Signal Loop turns what customers tell Invoca’s CSMs into routed, evidence-backed product insight. It runs inside Agent Ops, the platform I’d use to own every agent after launch: who uses it, what it costs, what it returns.
            </Lede>
          </Reveal.Item>
        </Reveal>
      </section>

      <motion.section className="hub__doors" aria-label="Choose how to begin" initial={calm ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : 0.7, ease: [0.22, 1, 0.36, 1], delay: calm ? 0 : 0.45 }}>
        <button className="hub-door hub-door--primary" onClick={startTour} data-testid="door-walkthrough">
          <span className="hub-door__k">01 · Guided</span>
          <span className="hub-door__title">Start the walkthrough</span>
          <span className="hub-door__body">The story, then you drive the real system through eight chapters. About {Math.round(TOTAL_TARGET_SEC / 60)} minutes presented, 15 on your own.</span>
          <span className="hub-door__go">
            Begin <Arrow />
          </span>
        </button>
        <button className="hub-door" onClick={explore} data-testid="door-explore">
          <span className="hub-door__k">02 · Free explore</span>
          <span className="hub-door__title">Open the system</span>
          <span className="hub-door__body">Run any of 48 calls through the live pipeline, review, change routing rules, read the evals.</span>
          <span className="hub-door__go">
            Open <Arrow />
          </span>
        </button>
        <Link className="hub-door" to="/write-up" data-testid="door-writeup">
          <span className="hub-door__k">03 · Read</span>
          <span className="hub-door__title">Read the write-up</span>
          <span className="hub-door__body">The four pillars on one page: the problem, the system, the rollout, and what comes next.</span>
          <span className="hub-door__go">
            Read <Arrow />
          </span>
        </Link>
      </motion.section>

      {resumable && (
        <div className="hub__resume">
          <Chip tone="accent" dot>
            In progress · {chapterById(tour.step.chapter).title}
          </Chip>
          <button className="n-btn n-btn--ghost n-btn--sm" onClick={resumeTour}>
            Resume where you left off <Arrow />
          </button>
        </div>
      )}

      <section className="hub__role" aria-label="How this maps to the role">
        {ROLE.map((r, i) => (
          <motion.div key={r.k} className="hub__pillar" initial={calm ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : 0.6, delay: calm ? 0 : 0.7 + i * 0.08 }}>
            <span className="n-label" style={{ color: 'var(--n-accent)' }}>{r.k}</span>
            <p>{r.v}</p>
          </motion.div>
        ))}
      </section>

      <footer className="hub__foot">
        <span className="n-note">Synthetic data only · fictional accounts · every panel labelled live or simulated</span>
        <span className="hub__backups">
          <span className="n-label">Q&amp;A</span>
          {BACKUPS.map((b) => (
            <Link key={b.topic} className="n-link" to={`/backup/${b.topic}`}>
              {b.title}
            </Link>
          ))}
        </span>
      </footer>
    </main>
  );
}

export default Hub;
