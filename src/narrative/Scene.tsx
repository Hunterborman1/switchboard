/**
 * Scene: the full-bleed narrative stage. Safe area top/bottom, 12-col grid in the body,
 * hairline footer with key hints, beat dots and the advance control.
 * Clicking empty stage advances (anything interactive opts out via data-no-advance).
 */
import type { MouseEvent, ReactNode } from 'react';
import { Arrow, Backdrop, Beats, Button, Eyebrow, KeyHint, Mark } from './components';

export type SceneProps = {
  num: string;
  label: string;
  beat: number;
  beats: number;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  children: ReactNode;
  /** Hide the footer (e.g. the scorecard owns its own actions). */
  bare?: boolean;
  footerNote?: ReactNode;
  className?: string;
  testId?: string;
};

export function Scene({ num, label, beat, beats, onNext, onBack, nextLabel = 'Next', children, bare, footerNote, className, testId }: SceneProps) {
  const onStageClick = (e: MouseEvent<HTMLElement>) => {
    if (!onNext) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, select, textarea, [data-no-advance], [role="button"]')) return;
    if (window.getSelection()?.toString()) return;
    onNext();
  };
  return (
    <section className={`n-scene ${className ?? ''}`} aria-roledescription="scene" aria-label={label} data-testid={testId ?? 'scene'} data-beat={beat}>
      <Backdrop />
      <header className="n-scene__top">
        <Mark href={`${import.meta.env.BASE_URL}`} />
        <Eyebrow num={num}>{label}</Eyebrow>
      </header>
      <div className="n-scene__body" onClick={onStageClick}>
        {children}
      </div>
      {!bare && (
        <footer className="n-scene__bottom">
          <span className="n-row" style={{ gap: 18 }}>
            <KeyHint keys={['→']} label="next" />
            <span className="n-scene__hint-hide">
              <KeyHint keys={['←']} label="back" />
            </span>
            <span className="n-scene__hint-hide">
              <KeyHint keys={['Esc']} label="menu" />
            </span>
            {footerNote && <span className="n-note n-scene__hint-hide">{footerNote}</span>}
          </span>
          <Beats count={beats} current={beat} />
          <span className="n-row" style={{ gap: 6 }}>
            {onBack && (
              <Button variant="quiet" size="sm" onClick={onBack} aria-label="Back">
                <Arrow dir="left" />
              </Button>
            )}
            {onNext && (
              <Button size="sm" onClick={onNext} data-testid="scene-next">
                {nextLabel} <Arrow />
              </Button>
            )}
          </span>
        </footer>
      )}
    </section>
  );
}
