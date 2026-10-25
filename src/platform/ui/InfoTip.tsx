/**
 * A small "i" button that shows a plain-English definition on hover or keyboard focus (and on
 * tap). The tooltip is portalled to <body> and clamped to the viewport, so it never clips inside
 * a table or a card and never causes sideways scroll.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function IconInfoSmall({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.75" />
      <path d="M8 5h.01" strokeWidth={2} />
    </svg>
  );
}

export function useTooltip<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(300, vw - 24);
    const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, vw - width - 12));
    const above = r.bottom + 140 > window.innerHeight && r.top > 160;
    setPos({ left, top: above ? window.innerHeight - r.top + 8 : r.bottom + 8, above });
  }, []);
  const hide = useCallback(() => setPos(null), []);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);
  return { ref, pos, show, hide };
}

export function TooltipBubble({ id, pos, children }: { id: string; pos: { left: number; top: number; above: boolean }; children: ReactNode }) {
  return createPortal(
    <div id={id} role="tooltip" className="ao-tooltip" style={{ left: pos.left, ...(pos.above ? { bottom: pos.top } : { top: pos.top }), width: 'max-content', maxWidth: Math.min(300, window.innerWidth - 24) }}>
      {children}
    </div>,
    document.body,
  );
}

/** Info button with a definition. `label` names what is being defined (for screen readers). */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const { ref, pos, show, hide } = useTooltip<HTMLButtonElement>();
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="ao-info"
        aria-label={`About ${label.toLowerCase()}`}
        aria-describedby={pos ? id : undefined}
        aria-expanded={pos ? true : false}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) hide();
          else show();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hide();
        }}
      >
        <IconInfoSmall />
      </button>
      {pos ? (
        <TooltipBubble id={id} pos={pos}>
          {children}
        </TooltipBubble>
      ) : null}
    </>
  );
}

/** Inline term with a dotted underline; its definition shows on hover or focus. */
export function Def({ children, tip }: { children: ReactNode; tip: ReactNode }) {
  const id = useId();
  const { ref, pos, show, hide } = useTooltip<HTMLSpanElement>();
  return (
    <>
      <span ref={ref} className="ao-def" tabIndex={0} aria-describedby={pos ? id : undefined} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        {children}
      </span>
      {pos ? (
        <TooltipBubble id={id} pos={pos}>
          {tip}
        </TooltipBubble>
      ) : null}
    </>
  );
}
