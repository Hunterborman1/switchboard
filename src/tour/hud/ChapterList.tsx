/**
 * The one chapter list: the scene rail, the narrow chapter menu and the Guide's chapter picker
 * all render this, so the order, numbering and labels can never drift apart. Every chapter is
 * numbered in one sequence; the current one is marked, earlier ones are ticked, and each is a
 * button that jumps there.
 */
import { IconCheck } from '../../ds/icons';
import { CHAPTERS, GROUPS, chapterById, fmtTarget } from '../script/chapters';
import type { ChapterId } from '../engine/types';

export function ChapterList({
  current,
  onPick,
  dense,
  showTimes = true,
  label = 'Chapters',
}: {
  /** The chapter on screen (or where the viewer left off); null before the presentation starts. */
  current: ChapterId | null;
  onPick: (id: ChapterId) => void;
  dense?: boolean;
  showTimes?: boolean;
  label?: string;
}) {
  const cur = current ? CHAPTERS.findIndex((c) => c.id === current) : -1;
  return (
    <nav className={`t-chapters${dense ? ' t-chapters--dense' : ''}`} aria-label={label}>
      {GROUPS.map((g) => (
        <div key={g.label} className="t-chapters__group">
          <span className="t-chapters__glabel">{g.label}</span>
          <ol>
            {g.ids.map((id) => {
              const c = chapterById(id);
              const i = CHAPTERS.findIndex((x) => x.id === id);
              const state = i === cur ? 'current' : cur >= 0 && i < cur ? 'done' : 'next';
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="t-chapters__item"
                    data-state={state}
                    data-chapter={id}
                    onClick={() => onPick(id)}
                    aria-current={state === 'current' ? 'step' : undefined}
                    title={c.title}
                  >
                    <span className="t-chapters__num" aria-hidden="true">
                      {state === 'done' ? <IconCheck size={12} strokeWidth={2.4} /> : c.part}
                    </span>
                    <span className="t-chapters__title">
                      <span className="n-sr">{state === 'done' ? 'Done: ' : state === 'current' ? 'Current: ' : ''}Chapter {c.part}, </span>
                      {c.title}
                    </span>
                    {showTimes ? <span className="t-chapters__time">{fmtTarget(c.targetSec)}</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </nav>
  );
}
