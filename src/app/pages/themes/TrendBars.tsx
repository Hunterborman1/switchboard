/**
 * Eight weeks of a theme in a few pixels: one small bar per week, the latest week in the
 * accent. Read-only; the full chart (with axes and a summary) lives on the theme page.
 */
import type { Theme } from '../../../shared/contracts';
import { weekStart } from './weeks';
import styles from './themes.module.css';

export function TrendBars({ weekly, name }: { weekly: Theme['weekly']; name: string }) {
  const max = Math.max(1, ...weekly.map((w) => w.count));
  const total = weekly.reduce((s, w) => s + w.count, 0);
  const desc = weekly.map((w) => `${weekStart(w.week)}: ${w.count}`).join(', ');
  return (
    <span className={styles.trend} role="img" aria-label={`${name}, insights per week over the last ${weekly.length} weeks: ${desc}`} title={`${total} in ${weekly.length} weeks. ${desc}`}>
      {weekly.map((w, i) => (
        <span
          key={w.week}
          className={i === weekly.length - 1 ? `${styles.trendBar} ${styles.trendBarLast}` : styles.trendBar}
          style={{
            height: w.count ? `${Math.max(12, (w.count / max) * 100)}%` : 2,
          }}
        />
      ))}
    </span>
  );
}
