/**
 * Signal Loop Narrative · components. Small, composable, editorial.
 * See ./README.md for the token + component reference.
 */
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useCalm, useCountUp } from './hooks';
import { reveal, revealReduced, stagger } from './motion';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- brand

export function LoopGlyph({ size = 22, live = false }: { size?: number; live?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="rgb(242 245 228 / 0.28)" strokeWidth="1.4" />
      <path d="M12 2a10 10 0 0 1 9.6 7.2" stroke="#8EE58E" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="21.6" cy="9.2" r="1.7" fill="#8EE58E">
        {live && <animate attributeName="opacity" values="1;0.35;1" dur="2.4s" repeatCount="indefinite" />}
      </circle>
      <path d="M7 12h1.6M10 9v6M13 7.5v9M16 10.5v3" stroke="#F2F5E4" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Mark({ sub = 'prepared for Invoca', href }: { sub?: string; href?: string }) {
  const inner = (
    <>
      <LoopGlyph />
      <b>Signal Loop</b>
      {sub && <span>· {sub}</span>}
    </>
  );
  return href ? (
    <a className="n-mark" href={href}>
      {inner}
    </a>
  ) : (
    <span className="n-mark">{inner}</span>
  );
}

// ---------------------------------------------------------------- backdrop

export function Backdrop({ grain = true }: { grain?: boolean }) {
  return (
    <>
      <div className="n-light" aria-hidden="true" />
      <div className="n-vignette" aria-hidden="true" />
      {grain && <div className="n-grain" aria-hidden="true" />}
    </>
  );
}

// ---------------------------------------------------------------- type

export function Eyebrow({ num, children, rule = true }: { num?: string; children: ReactNode; rule?: boolean }) {
  return (
    <p className="n-eyebrow">
      {num && <span className="n-eyebrow__num">{num}</span>}
      {num && rule && <span className="n-eyebrow__rule" aria-hidden="true" />}
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

/** Blur-reveal wrapper; children with <Reveal.Item> stagger in. */
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

export function Chip({ children, tone, dot }: { children: ReactNode; tone?: 'accent' | 'indigo' | 'danger' | 'amber'; dot?: boolean }) {
  return (
    <span className={cx('n-chip', tone && `n-chip--${tone}`)}>
      {dot && <span className="n-chip__dot" aria-hidden="true" />}
      {children}
    </span>
  );
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
    <span className="n-beats" aria-label={`Beat ${current + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="n-beats__dot" data-on={i <= current} data-current={i === current} />
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

export function PersonaCard({ persona, flipped, onFlip }: { persona: Persona; flipped: boolean; onFlip: () => void }) {
  const calm = useCalm();
  return (
    <button className="n-persona" onClick={onFlip} aria-pressed={flipped} aria-label={`${persona.role}: ${flipped ? 'showing job, struggles and success' : 'flip to see the job to be done'}`} data-no-advance>
      <motion.div className="n-persona__inner" animate={{ rotateY: flipped ? 180 : 0 }} transition={calm ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
        <div className="n-persona__face n-persona__face--front" aria-hidden={flipped}>
          <div className="n-persona__glyph">{persona.glyph}</div>
          <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
            <p className="n-persona__role">{persona.role}</p>
            <p className="n-persona__who">{persona.who}</p>
          </div>
          <Divider />
          <p className="n-persona__job" style={{ color: 'var(--n-ink-2)' }}>
            <span className="n-label" style={{ display: 'block', marginBottom: 6 }}>When…</span>
            {persona.job.when}
          </p>
          <div className="n-persona__foot">
            <span className="n-label">Job to be done</span>
            <span className="n-keys">
              <span>Flip</span>
              <Arrow />
            </span>
          </div>
        </div>
        <div className="n-persona__face n-persona__face--back" aria-hidden={!flipped}>
          <span className="n-label" style={{ color: 'var(--n-accent)' }}>{persona.role}</span>
          <p className="n-persona__job">
            When {persona.job.when}, I want <b>{persona.job.want}</b>, so I can {persona.job.so}.
          </p>
          <div className="n-persona__section">
            <span className="n-label">Struggles today</span>
            {persona.struggles.map((s) => (
              <p key={s}>— {s}</p>
            ))}
          </div>
          <div className="n-persona__section">
            <span className="n-label">Success looks like</span>
            <p style={{ color: 'var(--n-ink)' }}>{persona.success}</p>
          </div>
          {persona.emotional && (
            <p className="n-kicker" style={{ fontSize: '1.15rem', marginTop: 'auto' }}>
              “{persona.emotional}”
            </p>
          )}
        </div>
      </motion.div>
    </button>
  );
}

export { AnimatePresence, cx };
