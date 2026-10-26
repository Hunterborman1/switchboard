/**
 * Scene: a presentation page of the product. The same 52px top bar as Switchboard (the mark
 * and name, the chapter, "4 of 10", the chapter menu on narrow screens), the 1120px content
 * column, and a bottom bar with one muted keyboard hint, Back / Next, and one thin progress line
 * along its top edge. On wide screens the chapter rail (src/tour/hud/Hud.tsx) sits to its left.
 * Only the content between the bars changes from scene to scene, and only Back / Next (or the
 * arrow keys) move on: a click on the page itself never does.
 */
import type { ReactNode } from 'react';
import { Button, Kbd } from '../ds';
import { IconArrowLeft, IconArrowRight } from '../ds/icons';
import { SceneToolsSlot } from '../tour/hud/sceneSlot';
import { Brand } from './components';

export type SceneProps = {
  /** Chapter title, e.g. "Where feedback gets lost". */
  label: string;
  /** Which part of the talk this belongs to, e.g. "The problem". */
  group?: string;
  /** 1-based position of this chapter and the chapter count. */
  index: number;
  total: number;
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
      <Brand href={import.meta.env.BASE_URL} />
      {label ? (
        <span className="n-topbar__crumb">
          <span className="n-topbar__slash" aria-hidden="true">
            /
          </span>
          {group ? (
            <>
              <span className="n-topbar__group">{group}</span>
              <span className="n-topbar__slash n-topbar__slash--inner" aria-hidden="true">
                /
              </span>
            </>
          ) : null}
          <span className="n-topbar__chapter" aria-current="page">
            {label}
          </span>
        </span>
      ) : null}
      <span className="n-topbar__spacer" />
      {index != null && total != null ? (
        <span className="n-topbar__count" aria-label={`Chapter ${index} of ${total}`}>
          Chapter {index} of {total}
        </span>
      ) : null}
      <SceneToolsSlot />
    </header>
  );
}

export function Scene({ label, group, index, total, progress = 0, onNext, onBack, nextLabel = 'Next', children, bare, className, testId }: SceneProps) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 1000) / 10;
  return (
    <section className={`n-scene ${className ?? ''}`} aria-roledescription="scene" aria-label={label} data-testid={testId ?? 'scene'}>
      <SceneTopBar label={label} group={group} index={index} total={total} />
      <div className="n-scene__body">
        {children}
      </div>
      {!bare && (
        <footer className="n-bottombar">
          <span className="n-bottombar__progress" role="progressbar" aria-label="Walkthrough progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <i style={{ width: `${pct}%` }} />
          </span>
          <div className="n-bottombar__in">
            <p className="n-bottombar__hint">
              <span>Press</span>
              <Kbd>
                <IconArrowRight size={12} aria-label="Right arrow" />
              </Kbd>
              <span>for next,</span>
              <Kbd>
                <IconArrowLeft size={12} aria-label="Left arrow" />
              </Kbd>
              <span>for back</span>
            </p>
            <div className="n-bottombar__actions">
              {onBack && (
                <Button variant="ghost" icon={<IconArrowLeft />} onClick={onBack} aria-label="Back">
                  Back
                </Button>
              )}
              {onNext && (
                <Button variant="primary" iconRight={<IconArrowRight />} onClick={onNext} data-testid="scene-next">
                  {nextLabel}
                </Button>
              )}
            </div>
          </div>
        </footer>
      )}
    </section>
  );
}
