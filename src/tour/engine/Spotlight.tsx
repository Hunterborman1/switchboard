/**
 * One SVG mask cutout that moves between targets: a flat rgba(17,22,20,.45) dim with a
 * rounded hole and a 2px accent ring. Click-through only inside the cutout when the step
 * waits on a user action; everything else is blocked (and nudges the callout).
 */
import { motion } from 'motion/react';
import { useCalm } from '../../narrative/hooks';
import type { Box } from './useAnchor';

type Props = {
  box: Box | null;
  interact: 'target' | 'all' | 'none';
  /** The viewer has been idle on a step that needs them: show the ring a little stronger. */
  hint: boolean;
  onBlocked: () => void;
  highlights: Box[];
};

/** 240 ms layout move (DESIGN.md), no spring. */
const MOVE = { duration: 0.24, ease: [0.2, 0, 0, 1] } as const;

export function Spotlight({ box, interact, hint, onBlocked, highlights }: Props) {
  const calm = useCalm();
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  // No target → collapse the hole to the centre (full dim).
  const b = box ?? { x: vw / 2, y: vh / 2, w: 0, h: 0 };
  const r = box ? Math.min(8, b.h / 2, b.w / 2) : 0;
  const t = calm ? { duration: 0 } : MOVE;

  const blockers =
    interact === 'all'
      ? []
      : interact === 'none' || !box
        ? [{ left: 0, top: 0, width: '100%', height: '100%' }]
        : [
            { left: 0, top: 0, width: '100%', height: Math.max(0, b.y) },
            { left: 0, top: b.y + b.h, width: '100%', height: Math.max(0, vh - (b.y + b.h)) },
            { left: 0, top: b.y, width: Math.max(0, b.x), height: b.h },
            { left: b.x + b.w, top: b.y, width: Math.max(0, vw - (b.x + b.w)), height: b.h },
          ];

  return (
    <div className="t-spot" data-tour-ui aria-hidden="true">
      <svg className="t-spot__svg" width="100%" height="100%">
        <defs>
          <mask id="t-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <motion.rect initial={false} animate={{ x: b.x, y: b.y, width: b.w, height: b.h, rx: r }} transition={t} fill="black" />
            {highlights.map((h, i) => (
              <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx={8} fill="black" />
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgb(17 22 20 / 0.45)" mask="url(#t-mask)" />
        {box && (
          <motion.rect
            className="t-spot__ring"
            initial={false}
            animate={{ x: b.x, y: b.y, width: b.w, height: b.h, rx: r, strokeWidth: hint ? 3 : 2 }}
            transition={t}
            fill="none"
            stroke="#008463"
          />
        )}
        {highlights.map((h, i) => (
          <rect key={`h${i}`} x={h.x} y={h.y} width={h.w} height={h.h} rx={8} fill="none" stroke="#008463" strokeWidth={2} strokeDasharray="4 3" className="t-spot__ring" />
        ))}
      </svg>
      {blockers.map((s, i) => (
        <div
          key={i}
          className="t-spot__block"
          style={s}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBlocked();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </div>
  );
}
