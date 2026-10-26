/**
 * Narrative layer · components. The presentation pages (scenes, hub, write-up, Q&A, presenter)
 * are pages of the same product: they use the Switchboard design system (src/ds) for buttons,
 * badges, cards, quotes and marks, and add only what a presentation needs: the scene headline,
 * reveal-on-beat, a count-up stat and the persona card. See ./README.md.
 */
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ProductMark } from '../ds';
import { IconArrowRight, IconCheck, IconChevronRight } from '../ds/icons';
import { useCalm, useCountUp } from './hooks';
import { DUR, EASE } from './motion';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- brand + page bar

/** The product lockup: the Switchboard mark and name, optionally linking home. */
export function Brand({ href, label = 'Switchboard' }: { href?: string; label?: string }) {
  const inner = (
    <>
      <ProductMark product="switchboard" size={22} />
      <span className="n-brand__name">{label}</span>
    </>
  );
  return href ? (
    <a className="n-brand" href={href} aria-label={`${label} home`}>
      {inner}
    </a>
  ) : (
    <span className="n-brand">{inner}</span>
  );
}

/**
 * The 52px bar every presentation page shares (hub, write-up, Q&A, presenter, not found): the
 * product lockup, an optional page name after a slash, and the page's actions on the right.
 */
export function SiteBar({ context, children, full }: { context?: ReactNode; children?: ReactNode; full?: boolean }) {
  return (
    <header className="n-sitebar">
      <div className={cx('n-sitebar__in', full && 'n-sitebar__in--full')}>
        <Brand href={import.meta.env.BASE_URL} />
        {context ? (
          <span className="n-sitebar__context">
            <span className="n-sitebar__slash" aria-hidden="true">
              /
            </span>
            <span className="n-sitebar__page">{context}</span>
          </span>
        ) : null}
        <span className="n-sitebar__spacer" />
        {children ? <div className="n-sitebar__end">{children}</div> : null}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- type

export function Display({ as: Tag = 'h1', children, className, style }: { as?: 'h1' | 'h2' | 'h3' | 'p'; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <Tag className={cx('n-display', className)} style={style}>
      {children}
    </Tag>
  );
}

export function Lede({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('n-lede', className)}>{children}</p>;
}

/**
 * Scene head: one headline and one supporting line per beat. Every beat's head is laid out in
 * the same grid cell, so the head is always as tall as its longest version and nothing below it
 * moves when the beat changes. Only the active one is visible (and in the accessibility tree).
 */
export function SceneHead({ heads, active = 0 }: { heads: { title: ReactNode; line?: ReactNode }[]; active?: number }) {
  const cur = Math.max(0, Math.min(active, heads.length - 1));
  return (
    <div className="n-head">
      {heads.map((h, i) => (
        <div key={i} className="n-head__v" data-active={i === cur ? 'true' : 'false'} aria-hidden={i === cur ? undefined : true}>
          <h1 className="n-display">{h.title}</h1>
          {h.line ? <p className="n-lede">{h.line}</p> : null}
        </div>
      ))}
    </div>
  );
}

/**
 * A part of a scene that arrives on a beat. It always takes its space (so nothing moves when it
 * appears) and is invisible, and out of the accessibility tree, until `show`.
 */
export function Appear({
  show,
  delay = 0,
  y = 6,
  as = 'div',
  className,
  style,
  children,
  attrs,
}: {
  show: boolean;
  delay?: number;
  y?: number;
  as?: 'div' | 'li' | 'section' | 'span';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  attrs?: Record<string, string>;
}) {
  const calm = useCalm();
  const M = (as === 'li' ? motion.li : as === 'section' ? motion.section : as === 'span' ? motion.span : motion.div) as typeof motion.div;
  return (
    <M
      className={className}
      initial={false}
      animate={{ opacity: show ? 1 : 0, y: show || calm ? 0 : y }}
      transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: show && !calm ? delay : 0 }}
      style={{ ...style, visibility: show ? 'visible' : 'hidden' }}
      aria-hidden={show ? undefined : true}
      {...attrs}
    >
      {children}
    </M>
  );
}

// ---------------------------------------------------------------- figures

export function Stat({ value, label, prefix = '', suffix = '', decimals = 0, start = true, tone, size, note }: { value: number; label: ReactNode; prefix?: string; suffix?: string; decimals?: number; start?: boolean; tone?: 'accent'; size?: 'sm'; note?: ReactNode }) {
  const v = useCountUp(value, { start, decimals });
  const shown = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US');
  return (
    <div className={cx('n-stat', tone && `n-stat--${tone}`, size && `n-stat--${size}`)}>
      <div className="n-stat__value" aria-label={`${prefix}${decimals ? value.toFixed(decimals) : value}${suffix}`}>
        {prefix}
        {shown}
        {suffix && <span className="n-stat__unit">{suffix}</span>}
      </div>
      <div className="n-stat__label">{label}</div>
      {note && <div className="n-note">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- small marks

export function Arrow({ dir = 'right', size = 16 }: { dir?: 'right' | 'left' | 'down'; size?: number }) {
  const r = dir === 'left' ? 180 : dir === 'down' ? 90 : 0;
  return <IconArrowRight size={size} style={r ? { transform: `rotate(${r}deg)` } : undefined} aria-hidden="true" />;
}

/** A small accent check in a circle, for lists of things that are true. */
export function Check() {
  return (
    <span className="n-check" aria-hidden="true">
      <IconCheck size={12} strokeWidth={2.4} />
    </span>
  );
}

/** A quiet label above a group (13px, secondary). */
export function Label({ children, as: Tag = 'span', className }: { children: ReactNode; as?: ElementType; className?: string }) {
  return <Tag className={cx('n-label', className)}>{children}</Tag>;
}

// ---------------------------------------------------------------- persona card

export type Persona = {
  id: string;
  role: string;
  who: string;
  glyph: ReactNode;
  job: { when: string; want: string; so: string };
  struggles: string[];
  success: string;
  emotional?: string;
};

/** The job on the front; click (or Enter) to reveal struggles and success. 180 ms crossfade, no flip. */
export function PersonaCard({ persona, flipped, onFlip }: { persona: Persona; flipped: boolean; onFlip: () => void }) {
  const calm = useCalm();
  const fade = { duration: calm ? 0 : DUR.ui, ease: EASE };
  return (
    <button
      type="button"
      className="n-persona"
      onClick={onFlip}
      aria-pressed={flipped}
      aria-label={`${persona.role}: ${flipped ? 'showing struggles and success. Select to go back to the job' : 'showing the job. Select to see what gets in the way'}`}
      data-no-advance
    >
      <div className="n-persona__head">
        <div className="n-persona__glyph">{persona.glyph}</div>
        <div className="n-persona__id">
          <p className="n-persona__role">{persona.role}</p>
          <p className="n-persona__who">{persona.who}</p>
        </div>
      </div>
      <div className="n-persona__panes">
        <AnimatePresence initial={false}>
          {!flipped ? (
            <motion.div key="front" className="n-persona__pane" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
              <p className="n-persona__job">
                When {persona.job.when}, I want <b>{persona.job.want}</b>, so I can {persona.job.so}.
              </p>
            </motion.div>
          ) : (
            <motion.div key="back" className="n-persona__pane" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
              <div className="n-persona__section">
                <span className="n-persona__k">What gets in the way today</span>
                <ul>
                  {persona.struggles.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="n-persona__section">
                <span className="n-persona__k">Success looks like</span>
                <p className="n-persona__success">{persona.success}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="n-persona__foot">
        <span className="n-persona__flip">{flipped ? 'Back to the job' : 'What gets in the way'}</span>
        <IconChevronRight size={16} className="n-persona__chev" />
      </div>
    </button>
  );
}

export { AnimatePresence, cx };
