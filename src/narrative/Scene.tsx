/**
 * Scene: a presentation page in the product's own language. A still top bar (mark, chapter,
 * "4 of 17"), the 1120 px content column, and a still bottom bar (progress line, key hints,
 * Back / Next). Only the content between the bars changes from scene to scene.
 * Clicking empty stage advances (anything interactive opts out via data-no-advance).
 */
import type { MouseEvent, ReactNode } from 'react';
import { Arrow, Beats, Button, Mark } from './components';

export type SceneProps = {
  /** Chapter title, e.g. "Where feedback gets lost". */
  label: string;
  /** Which part of the talk this belongs to, e.g. "The problem". */
  group?: string;
  /** 1-based position of this chapter and the chapter count. */
  index: number;
  total: number;
  beat: number;
  beats: number;
  /** Overall walkthrough progress, 0..1. */
  progress?: number;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  children: ReactNode;
  /** Hide the bottom bar (e.g. the scorecard owns its own actions). */
  bare?: boolean;
  className?: string;
  testId?: string;
};

export function SceneTopBar({ label, group, index, total }: { label?: string; group?: string; index?: number; total?: number }) {
  return (
    <header className="n-topbar">
      <Mark href={`${import.meta.env.BASE_URL}`} />
      <span className="n-topbar__chapter">
        {group && <span className="n-topbar__group">{group} /</span>}
        {label && <span>{label}</span>}
      </span>
      <span className="n-topbar__right">{index != null && total != null && <span className="n-topbar__count">{index} of {total}</span>}</span>
    </header>
  );
}

export function Scene({ label, group, index, total, beat, beats, progress = 0, onNext, onBack, nextLabel = 'Next', children, bare, className, testId }: SceneProps) {
  const onStageClick = (e: MouseEvent<HTMLElement>) => {
    if (!onNext) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, textarea, [data-no-advance], [role="button"]')) return;
    if (window.getSelection()?.toString()) return;
    onNext();
  };
  return (
    <section className={`n-scene ${className ?? ''}`} aria-roledescription="scene" aria-label={label} data-testid={testId ?? 'scene'} data-beat={beat}>
      <SceneTopBar label={label} group={group} index={index} total={total} />
      <div className="n-scene__body" onClick={onStageClick}>
        {children}
      </div>
      {!bare && (
        <footer className="n-bottombar">
          <span className="n-bottombar__progress" aria-hidden="true">
            <i style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 10}%` }} />
          </span>
          <div className="n-bottombar__inner">
            <span className="n-bottombar__hints">→ or Space for next · ← for back · Esc for the menu</span>
            <span className="n-bottombar__actions">
              <Beats count={beats} current={beat} />
              {onBack && (
                <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back">
                  <Arrow dir="left" /> Back
                </Button>
              )}
              {onNext && (
                <Button size="sm" onClick={onNext} data-testid="scene-next">
                  {nextLabel} <Arrow />
                </Button>
              )}
            </span>
          </div>
        </footer>
      )}
    </section>
  );
}
