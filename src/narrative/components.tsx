/**
 * Signal Loop Narrative · components. Small, flat, composable (docs/DESIGN.md).
 * See ./README.md for the token + component reference.
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useCalm, useCountUp } from './hooks';
import { DUR, EASE, reveal, revealReduced, stagger } from './motion';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- brand

/** The Signal Loop mark: a flat accent tile with four waveform bars. */
export function LoopGlyph({ size = 24 }: { size?: number; live?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#008463" />
      <path d="M7 10.5v3M10.33 8v8M13.67 6.5v11M17 9.5v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Mark({ sub, href, size = 24 }: { sub?: string; href?: string; size?: number }) {
  const inner = (
    <>
      <LoopGlyph size={size} />
      <span className="n-mark__name">Signal Loop</span>
      {sub && <span className="n-mark__sub">{sub}</span>}
    </>
  );
  return href ? (
    <a className="n-mark" href={href} aria-label="Signal Loop home">
      {inner}
    </a>
  ) : (
    <span className="n-mark">{inner}</span>
  );
}

/** Kept for call sites from the dark theme: the light theme has no backdrop. */
export function Backdrop(_props: { grain?: boolean }) {
  return null;
}

// ---------------------------------------------------------------- type

export function Eyebrow({ num, children }: { num?: string; children: ReactNode; rule?: boolean }) {
  return (
    <p className="n-eyebrow">
      {num && <span className="n-eyebrow__num">{num}</span>}
      <span>{children}</span>
    </p>
  );
}

type DisplaySize = 'sm' | 'md' | 'lg' | 'xl';
export function Display({ size = 'lg', as = 'h1', children, style, className }: { size?: DisplaySize; as?: 'h1' | 'h2' | 'h3' | 'p'; children: ReactNode; style?: CSSProperties; className?: string }) {
  const Tag = as;
  return (
    <Tag className={cx('n-display', `n-display--${size}`, className)} style={style}>
      {children}
    </Tag>
  );
}

export function Lede({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p className="n-lede" style={style}>
      {children}
    </p>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="n-kicker">{children}</p>;
}

/** Scene head: one headline and one supporting line, cross-fading when `k` changes. */
export function SceneHead({ k, title, line, size = 'md' }: { k?: string | number; title: ReactNode; line?: ReactNode; size?: DisplaySize }) {
  const calm = useCalm();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={k ?? 'head'}
        className="n-head"
        initial={calm ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: { duration: calm ? 0 : DUR.ui * 0.6, ease: [0.4, 0, 1, 1] } }}
        transition={{ duration: calm ? 0 : DUR.ui, ease: EASE }}
      >
        <Display size={size} as="h2">
          {title}
        </Display>
        {line && <Lede>{line}</Lede>}
      </motion.div>
    </AnimatePresence>
  );
}

/** Fade-up wrapper; children with <Reveal.Item> follow one after another. */
export function Reveal({ children, delay = 0, each, className, style, as = 'div' }: { children: ReactNode; delay?: number; each?: number; className?: string; style?: CSSProperties; as?: 'div' | 'section' | 'ul' }) {
  const calm = useCalm();
  const M = as === 'section' ? motion.section : as === 'ul' ? motion.ul : motion.div;
  return (
    <M className={className} style={style} variants={calm ? stagger(0, 0) : stagger(delay, each)} initial="hidden" animate="show" exit="exit">
      {children}
    </M>
  );
}
function RevealItem({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const calm = useCalm();
  return (
    <motion.div className={className} style={style} variants={calm ? revealReduced : reveal}>
      {children}
    </motion.div>
  );
}
Reveal.Item = RevealItem;

// ---------------------------------------------------------------- figures

export function Stat({ value, label, prefix = '', suffix = '', decimals = 0, start = true, tone, size, note }: { value: number; label: ReactNode; prefix?: string; suffix?: string; decimals?: number; start?: boolean; tone?: 'accent'; size?: 'sm'; note?: ReactNode }) {
  const v = useCountUp(value, { start, decimals });
  const shown = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString('en-US');
  return (
    <div className={cx('n-stat', tone && `n-stat--${tone}`, size && `n-stat--${size}`)}>
      <div className="n-stat__value" aria-label={`${prefix}${decimals ? value.toFixed(decimals) : value}${suffix}`}>
        {prefix}
        {shown}
        {suffix && <small>{suffix}</small>}
      </div>
      <div className="n-stat__label">{label}</div>
      {note && <div className="n-note">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- surfaces

export function Card({ children, raised, accent, flush, className, style }: { children: ReactNode; raised?: boolean; accent?: boolean; flush?: boolean; className?: string; style?: CSSProperties }) {
  return <div className={cx('n-card', raised && 'n-card--raised', accent && 'n-card--accent', flush && 'n-card--flush', className)} style={style}>{children}</div>;
}

export function Callout({ children, tone, style }: { children: ReactNode; tone?: 'assumption' | 'danger'; style?: CSSProperties }) {
  return (
    <div className={cx('n-callout', tone && `n-callout--${tone}`)} style={style} role="note">
      <div>{children}</div>
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: 'accent' | 'indigo' | 'danger' | 'amber'; dot?: boolean }) {
  return <span className={cx('n-chip', tone && `n-chip--${tone}`)}>{children}</span>;
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return <hr className={cx('n-divider', vertical && 'n-divider--v')} aria-hidden="true" />;
}

// ---------------------------------------------------------------- controls

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet'; size?: 'sm' | 'lg'; arrow?: boolean };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'primary', size, arrow, className, children, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx('n-btn', `n-btn--${variant}`, size && `n-btn--${size}`, className)} {...rest}>
      {children}
      {arrow && <Arrow />}
    </button>
  );
});

export function Arrow({ dir = 'right' }: { dir?: 'right' | 'left' | 'up' }) {
  const r = dir === 'left' ? 180 : dir === 'up' ? -90 : 0;
  return (
    <svg className="n-btn__arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ transform: `rotate(${r}deg)` }}>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Key({ children }: { children: ReactNode }) {
  return <kbd className="n-key">{children}</kbd>;
}
export function KeyHint({ keys, label }: { keys: ReactNode[]; label?: ReactNode }) {
  return (
    <span className="n-keys">
      {keys.map((k, i) => (
        <Key key={i}>{k}</Key>
      ))}
      {label && <span>{label}</span>}
    </span>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="n-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className="n-progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Beats({ count, current }: { count: number; current: number }) {
  if (count <= 1) return null;
  return (
    <span className="n-beats" aria-label={`Step ${current + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="n-beats__dot" data-on={i <= current} />
      ))}
    </span>
  );
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
    <button className="n-persona" onClick={onFlip} aria-pressed={flipped} aria-label={`${persona.role}: ${flipped ? 'showing struggles and success. Select to go back to the job' : 'showing the job. Select to see what gets in the way'}`} data-no-advance>
      <div className="n-persona__head">
        <div className="n-persona__glyph">{persona.glyph}</div>
        <p className="n-persona__role">{persona.role}</p>
        <p className="n-persona__who">{persona.who}</p>
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
                <span className="n-label">What gets in the way today</span>
                <ul>
                  {persona.struggles.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div className="n-persona__section">
                <span className="n-label">Success looks like</span>
                <p className="n-persona__success">{persona.success}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="n-persona__foot">
        <span>{flipped ? 'Today' : 'The job'}</span>
        <span>{flipped ? 'Back to the job' : 'What gets in the way'}</span>
      </div>
    </button>
  );
}

export { AnimatePresence, cx };
