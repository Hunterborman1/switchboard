/**
 * Design-system primitives: buttons, badges, avatars and the small pieces every page uses.
 * Class names come from ./ds.css; nothing here sets inline colours.
 */
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { IconCheck, IconCopy } from './icons';
import { Tooltip } from './overlay';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
export { cx };

// ---------------------------------------------------------------- button

/** danger: outlined, for a destructive action on a page. destructive: filled, for the confirm button in a dialog. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonOwn = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  block?: boolean;
  /** Keyboard shortcut shown inside the button ("A"). */
  kbd?: string;
};

function buttonClass({ variant = 'secondary', size = 'md', block, iconOnly }: ButtonOwn & { iconOnly?: boolean }, extra?: string) {
  return cx('ds-btn', `ds-btn--${variant}`, size !== 'md' && `ds-btn--${size}`, block && 'ds-btn--block', iconOnly && 'ds-btn--icon', extra);
}

function ButtonInner({ icon, iconRight, loading, kbd, children }: ButtonOwn & { children?: ReactNode }) {
  return (
    <>
      {loading ? <span className="ds-spinner" aria-hidden="true" /> : icon}
      {children}
      {iconRight}
      {kbd ? (
        <span className="ds-btn__kbd" aria-hidden="true">
          {kbd}
        </span>
      ) : null}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonOwn & ButtonHTMLAttributes<HTMLButtonElement>>(function Button(
  { variant, size, icon, iconRight, loading, block, kbd, className, children, type = 'button', disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <ButtonInner icon={icon} iconRight={iconRight} loading={loading} kbd={kbd}>
        {children}
      </ButtonInner>
    </button>
  );
});

/** A router link styled as a button. */
export function ButtonLink({ variant, size, icon, iconRight, block, className, children, ...rest }: ButtonOwn & LinkProps) {
  return (
    <Link className={buttonClass({ variant, size, block }, className)} {...rest}>
      <ButtonInner icon={icon} iconRight={iconRight}>
        {children}
      </ButtonInner>
    </Link>
  );
}

/** Icon-only button. `label` is the accessible name and the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, { label: string; icon: ReactNode; variant?: ButtonVariant; size?: ButtonSize; tooltip?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>>(
  function IconButton({ label, icon, variant = 'ghost', size = 'md', tooltip = true, className, type = 'button', ...rest }, ref) {
    const btn = (
      <button ref={ref} type={type} aria-label={label} className={buttonClass({ variant, size, iconOnly: true }, className)} {...rest}>
        {icon}
      </button>
    );
    return tooltip ? <Tooltip label={label}>{btn}</Tooltip> : btn;
  },
);

export function Spinner({ label }: { label?: string }) {
  return <span className="ds-spinner" role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

// ---------------------------------------------------------------- badge

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ tone = 'neutral', dot, size, outline, children, title, className }: { tone?: Tone; dot?: boolean; size?: 'md' | 'lg'; outline?: boolean; children: ReactNode; title?: string; className?: string }) {
  return (
    <span className={cx('ds-badge', tone !== 'neutral' && `ds-badge--${tone}`, outline && 'ds-badge--outline', size === 'lg' && 'ds-badge--lg', className)} title={title}>
      {dot ? <span className="ds-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** Category marker: a small coloured square plus a label (insight type, chart series). */
export function DotLabel({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx('ds-dot-label', className)}>
      <span className="ds-dot-label__dot" style={{ background: color }} aria-hidden="true" />
      <span className="ds-truncate">{children}</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ds-kbd">{children}</kbd>;
}

// ---------------------------------------------------------------- avatar + person

const AVATAR_TINTS: [string, string][] = [
  ['var(--accent-subtle)', 'var(--accent-text)'],
  ['var(--info-subtle)', 'var(--info)'],
  ['var(--warning-subtle)', 'var(--warning)'],
  ['#F1EBF8', '#6A43A0'],
  ['#E6F2F4', '#2F6F7C'],
  ['#F8EBEE', '#9A3A4B'],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || '?';
}

export function Avatar({ name, initials, size = 'md', className }: { name: string; initials?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const [bg, fg] = AVATAR_TINTS[hash(name) % AVATAR_TINTS.length]!;
  return (
    <span className={cx('ds-avatar', size !== 'md' && `ds-avatar--${size}`, className)} style={{ ['--av-bg' as string]: bg, ['--av-fg' as string]: fg }} aria-hidden="true">
      {initials ?? initialsOf(name)}
    </span>
  );
}

export function PersonChip({ name, sub, initials, size = 'md' }: { name: string; sub?: ReactNode; initials?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className="ds-person">
      <Avatar name={name} initials={initials} size={size} />
      <span className="ds-person__text">
        <span className="ds-person__name">{name}</span>
        {sub ? <span className="ds-person__sub">{sub}</span> : null}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- copyable id

export function CopyText({ value, display, label }: { value: string; display?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip label={copied ? 'Copied' : (label ?? 'Copy')}>
      <button
        type="button"
        className="ds-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          });
        }}
        aria-label={`${label ?? 'Copy'} ${value}`}
      >
        <span>{display ?? value}</span>
        {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
      </button>
    </Tooltip>
  );
}
