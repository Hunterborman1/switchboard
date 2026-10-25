/**
 * 01 · The insight black hole. Canvas particle field: feedback leaves customer calls; a few
 * particles reach an owner, most spiral into a void. Reduced motion → one composed frame.
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Callout, Display, Lede, Reveal, Stat } from '../components';
import { useCalm } from '../hooks';

type P = { t: number; speed: number; src: number; dst: number; fate: 'reach' | 'lost'; wob: number; size: number; spin: number };

const OWNERS = ['Product', 'VP Product', 'Sales', 'Support', 'Competitive'];
const CALLS = 6;

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function useField(canvasRef: React.RefObject<HTMLCanvasElement>, intensity: number, calm: boolean) {
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const rnd = rand(42);
    const parts: P[] = [];
    const spawn = (t0 = 0) => {
      parts.push({ t: t0, speed: 0.0028 + rnd() * 0.0022, src: Math.floor(rnd() * CALLS), dst: Math.floor(rnd() * OWNERS.length), fate: rnd() < 0.4 ? 'reach' : 'lost', wob: rnd() * Math.PI * 2, size: 1.2 + rnd() * 1.8, spin: rnd() < 0.5 ? 1 : -1 });
    };

    const geo = () => {
      const narrow = w < 640;
      const callX = narrow ? w * 0.1 : w * 0.08;
      const ownX = narrow ? w * 0.9 : w * 0.92;
      const void_ = { x: w * 0.55, y: h * 0.62, r: Math.min(w, h) * (narrow ? 0.12 : 0.1) };
      const callY = (i: number) => h * 0.14 + (i / (CALLS - 1)) * h * 0.72;
      const ownY = (i: number) => h * 0.16 + (i / (OWNERS.length - 1)) * h * 0.68;
      return { callX, ownX, void_, callY, ownY };
    };

    const pos = (p: P) => {
      const { callX, ownX, void_, callY, ownY } = geo();
      const x0 = callX + 16;
      const y0 = callY(p.src);
      if (p.fate === 'reach') {
        const x3 = ownX - 16;
        const y3 = ownY(p.dst);
        const t = p.t;
        const cx1 = w * 0.38;
        const cy1 = y0 - h * 0.12;
        const cx2 = w * 0.7;
        const cy2 = y3 + h * 0.1;
        const mt = 1 - t;
        const x = mt * mt * mt * x0 + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * x3;
        const y = mt * mt * mt * y0 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * y3;
        return { x, y, a: t > 0.92 ? (1 - t) / 0.08 : Math.min(1, t * 8) };
      }
      // lost: drift right, then spiral into the void
      const t = p.t;
      if (t < 0.45) {
        const k = t / 0.45;
        const x = x0 + (void_.x - void_.r * 2.4 - x0) * k;
        const y = y0 + (void_.y - y0) * k * k * 0.7 + Math.sin(p.wob + k * 6) * 6;
        return { x, y, a: Math.min(1, t * 8) };
      }
      const k = (t - 0.45) / 0.55;
      const startX = void_.x - void_.r * 2.4;
      const startY = y0 + (void_.y - y0) * 0.7;
      const ang0 = Math.atan2(startY - void_.y, startX - void_.x);
      const rad0 = Math.hypot(startX - void_.x, startY - void_.y);
      const ang = ang0 + p.spin * k * Math.PI * 3.2;
      const rad = rad0 * Math.pow(1 - k, 1.6);
      return { x: void_.x + Math.cos(ang) * rad, y: void_.y + Math.sin(ang) * rad * 0.55, a: 1 - k * k };
    };

    const drawFrame = () => {
      const { callX, ownX, void_, callY, ownY } = geo();
      g.clearRect(0, 0, w, h);
      const inten = intensityRef.current;
      // void
      const vg = g.createRadialGradient(void_.x, void_.y, 0, void_.x, void_.y, void_.r * 3.2);
      vg.addColorStop(0, 'rgba(0,0,0,1)');
      vg.addColorStop(0.32, 'rgba(1,8,6,0.95)');
      vg.addColorStop(0.55, `rgba(255,156,140,${0.05 + inten * 0.05})`);
      vg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = vg;
      g.beginPath();
      g.ellipse(void_.x, void_.y, void_.r * 3.2, void_.r * 3.2 * 0.62, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(255,156,140,${0.18 + inten * 0.12})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(void_.x, void_.y, void_.r * 1.25, void_.r * 1.25 * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
      // owner lane guides
      g.font = '500 10.5px "JetBrains Mono Variable", monospace';
      g.textBaseline = 'middle';
      for (let i = 0; i < OWNERS.length; i++) {
        const y = ownY(i);
        g.fillStyle = 'rgba(142,229,142,0.08)';
        g.beginPath();
        g.arc(ownX, y, 14, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(142,229,142,0.55)';
        g.beginPath();
        g.arc(ownX, y, 14, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = 'rgba(242,245,228,0.55)';
        g.textAlign = 'right';
        if (w > 520) g.fillText(OWNERS[i]!.toUpperCase(), ownX - 24, y);
      }
      // calls
      for (let i = 0; i < CALLS; i++) {
        const y = callY(i);
        g.fillStyle = 'rgba(242,245,228,0.05)';
        g.strokeStyle = 'rgba(242,245,228,0.35)';
        g.beginPath();
        g.arc(callX, y, 15, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        // phone glyph: tiny waveform bars
        g.strokeStyle = 'rgba(242,245,228,0.9)';
        g.lineWidth = 1.6;
        g.lineCap = 'round';
        [-6, -2, 2, 6].forEach((dx, j) => {
          const hh = [3, 6, 5, 2][j]!;
          g.beginPath();
          g.moveTo(callX + dx, y - hh);
          g.lineTo(callX + dx, y + hh);
          g.stroke();
        });
        g.lineWidth = 1;
      }
      // particles
      for (const p of parts) {
        const { x, y, a } = pos(p);
        const reach = p.fate === 'reach';
        g.globalAlpha = Math.max(0, Math.min(1, a)) * (reach ? 1 : 0.75);
        g.fillStyle = reach ? '#8EE58E' : '#F2F5E4';
        if (reach) {
          g.shadowColor = 'rgba(142,229,142,0.8)';
          g.shadowBlur = 8;
        }
        g.beginPath();
        g.arc(x, y, p.size, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    if (calm) {
      for (let i = 0; i < 70; i++) spawn(rnd());
      drawFrame();
    } else {
      for (let i = 0; i < 40; i++) spawn(rnd());
      const loop = (now: number) => {
        const dt = Math.min(48, now - last);
        last = now;
        acc += dt * (0.05 + intensityRef.current * 0.02);
        while (acc > 1) {
          spawn();
          acc -= 1;
        }
        for (const p of parts) p.t += p.speed * (dt / 16);
        for (let i = parts.length - 1; i >= 0; i--) if (parts[i]!.t >= 1) parts.splice(i, 1);
        drawFrame();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvasRef, calm]);
}

export function BlackHole({ beat }: { beat: number }) {
  const calm = useCalm();
  const ref = useRef<HTMLCanvasElement>(null);
  useField(ref, beat, calm);
  return (
    <div className="n-grid sc-bh">
      <div className="n-col-5 sc-bh__copy">
        <AnimatePresence mode="wait">
          {beat === 0 && (
            <Reveal key="b0" className="n-stack--lg n-stack">
              <Reveal.Item>
                <Display size="md" as="h2">
                  Customers tell CSMs <em>exactly</em> what to build.
                </Display>
              </Reveal.Item>
              <Reveal.Item>
                <Lede>What’s broken. What’s missing. What a competitor just offered them. It comes up on every QBR, renewal and check-in.</Lede>
              </Reveal.Item>
            </Reveal>
          )}
          {beat >= 1 && (
            <Reveal key="b1" className="n-stack--lg n-stack">
              <Reveal.Item>
                <Display size="md" as="h2">
                  Most of it falls into a <em>black hole.</em>
                </Display>
              </Reveal.Item>
              <Reveal.Item>
                <Lede>It lives in a notes field, a Slack thread that scrolls away, or a CSM’s memory. The person who could act on it never hears it.</Lede>
              </Reveal.Item>
            </Reveal>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {beat >= 1 && (
            <motion.div className="sc-bh__stat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: calm ? 0 : 0.6, ease: [0.22, 1, 0.36, 1], delay: calm ? 0 : 0.4 }}>
              <Stat value={4} suffix=" of 10" label="pieces of feedback reach an owner" tone="accent" />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {beat >= 2 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: calm ? 0 : 0.5 }}>
              <Callout tone="assumption">
                <span className="n-label" style={{ color: 'var(--n-amber)' }}>Assumption</span>
                <br />
                An illustrative figure, not a measurement. The first thing I’d do is a 2-week time study with two CSMs to replace it with a real number.
              </Callout>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="n-col-7 sc-bh__field" data-no-advance={false}>
        <canvas ref={ref} className="sc-bh__canvas" aria-label="Feedback particles leave six customer calls. About four in ten reach an owner; the rest spiral into a void." role="img" />
        <div className="sc-bh__legend">
          <span><i style={{ background: 'var(--n-accent)' }} /> reaches an owner</span>
          <span><i style={{ background: 'var(--n-ink)' }} /> lost in a handoff</span>
        </div>
      </div>
    </div>
  );
}
