/**
 * Narrative layer · components. The presentation pages (scenes, hub, write-up, Q&A, presenter)
 * are pages of the same product: they use the Switchboard design system (src/ds) for buttons,
 * badges, cards, quotes and marks, and add only what a presentation needs: the scene headline,
 * one calm entrance per part of a scene, and a count-up stat. See ./README.md.
 */
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { motion } from 'motion/react';
import { ProductMark } from '../ds';
import { IconArrowRight, IconCheck } from '../ds/icons';
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
 * Scene head: the headline, an optional line of metadata under it (a byline, a link), and one
 * supporting line. A scene has one head; it never changes while the scene is on screen.
 */
export function SceneHead({ title, meta, line }: { title: ReactNode; meta?: ReactNode; line?: ReactNode }) {
  return (
    <div className="n-head">
      <h1 className="n-display">{title}</h1>
      {meta ? <div className="n-head__meta">{meta}</div> : null}
      {line ? <p className="n-lede">{line}</p> : null}
    </div>
  );
}

/**
 * One part of a scene, arriving once when the scene does: a fade and a short rise, `delay`
 * seconds in. Scenes stagger their parts so the whole entrance settles within about 600 ms.
 * Nothing waits for a click, and reduced motion draws the final frame at once.
 */
export function Enter({
  delay = 0,
  y = 6,
  as = 'div',
  className,
  style,
  children,
  attrs,
}: {
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
      style={style}
      initial={calm ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: calm ? 0 : DUR.layout, ease: EASE, delay: calm ? 0 : delay }}
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

export { cx };
