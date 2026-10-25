/**
 * One SVG mask cutout that springs between targets: a rounded rect with a feathered edge,
 * a soft lime ring, and an optional hint pulse. Click-through only inside the cutout when
 * the step waits on a user action; everything else is blocked (and nudges the callout).
 */
import { motion } from 'motion/react';
import { useCalm } from '../../narrative/hooks';
import type { Box } from './useAnchor';

type Props = {
  box: Box | null;
  interact: 'target' | 'all' | 'none';
  hint: boolean;
  onBlocked: () => void;
  highlights: Box[];
};

const SPRING = { type: 'spring', stiffness: 210, damping: 30, mass: 0.9 } as const;

export function Spotlight({ box, interact, hint, onBlocked, highlights }: Props) {
  const calm = useCalm();
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  // No target → collapse the hole to the centre (full dim).
  const b = box ?? { x: vw / 2, y: vh / 2, w: 0, h: 0 };
  const r = box ? Math.min(14, b.h / 2, b.w / 2) : 0;
  const t = calm ? { duration: 0 } : SPRING;

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
          <filter id="t-feather" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <mask id="t-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <motion.rect initial={false} animate={{ x: b.x, y: b.y, width: b.w, height: b.h, rx: r }} transition={t} fill="black" filter="url(#t-feather)" />
            {highlights.map((h, i) => (
              <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx={10} fill="black" opacity={0.55} filter="url(#t-feather)" />
            ))}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgb(3 14 11 / 0.6)" mask="url(#t-mask)" />
        {box && (
          <motion.rect
            className="t-spot__ring"
            initial={false}
            animate={{ x: b.x, y: b.y, width: b.w, height: b.h, rx: r }}
            transition={t}
            fill="none"
            stroke="#8EE58E"
            strokeOpacity={0.85}
            strokeWidth={1.5}
          />
        )}
        {box && hint && !calm && (
          <motion.rect
            key={`${Math.round(b.x)}-${Math.round(b.y)}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={r}
            fill="none"
            stroke="#8EE58E"
            strokeWidth={2}
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: [0.7, 0], scale: [1, 1.04] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
            style={{ transformOrigin: `${b.x + b.w / 2}px ${b.y + b.h / 2}px`, transformBox: 'view-box' }}
          />
        )}
        {highlights.map((h, i) => (
          <g key={`h${i}`}>
            <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={10} fill="rgb(142 229 142 / 0.12)" stroke="#00A87F" strokeWidth={2} className="t-spot__ring" />
            {!calm && (
              <motion.rect x={h.x} y={h.y} width={h.w} height={h.h} rx={10} fill="none" stroke="#00A87F" strokeWidth={2} initial={{ opacity: 0.8 }} animate={{ opacity: [0.8, 0] , strokeWidth: [2, 8] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }} />
            )}
          </g>
        ))}
      </svg>
      {blockers.map((s, i) => (
        <div key={i} className="t-spot__block" style={s} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onBlocked(); }} onClick={(e) => e.stopPropagation()} />
      ))}
    </div>
  );
}
