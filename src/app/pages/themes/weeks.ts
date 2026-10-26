/** ISO week helpers for theme trends ("2026-W43" ↔ the Monday it starts, and back). */

/** The Monday (UTC) an ISO week starts on. */
export function isoWeekMonday(week: string): Date | null {
  const m = week.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7);
  return monday;
}

/** "Oct 19" for the week starting Monday Oct 19 (falls back to the raw label). */
export function weekStart(week: string): string {
  const d = isoWeekMonday(week);
  return d
    ? d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : week;
}

/** The ISO week ("2026-W43") an instant falls in, in UTC. */
export function isoWeekOf(iso: string): string {
  const d = new Date(iso);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const w = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}
