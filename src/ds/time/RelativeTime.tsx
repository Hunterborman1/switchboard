
import { useEffect, useState } from "react";
import { formatAbsolute, formatRelative } from "./format";
import { useTimezone } from "./TimezoneContext";

export interface RelativeTimeProps {
  /** ISO timestamp, or null/undefined when the event hasn't happened
   * (renders "—" -- callers control whether that's appropriate, e.g. an
   * EmptyState is usually the better choice for a whole missing dataset). */
  value: string | null | undefined;
  /** When true, also renders the absolute timestamp inline (not just on
   * hover) -- e.g. "12m ago · 2026-08-05 14:20:11 UTC", per the design
   * system's table-row example. Defaults to false (hover/title only). */
  showAbsoluteInline?: boolean;
}

/**
 * Relative time with the absolute instant available on hover (native
 * `title` tooltip) -- "12m ago · 2026-08-05 14:20:11 UTC" per
 * designs/00-console-design-system.md's universal table rule. Honors the
 * console-wide UTC/America-Los_Angeles toggle via TimezoneContext, so
 * flipping that toggle updates every RelativeTime on the page at once.
 * Recomputes the relative label every 30s so a page left open doesn't drift
 * ("12m ago" silently becoming wrong after an hour).
 */
export function RelativeTime({ value, showAbsoluteInline = false }: RelativeTimeProps) {
  const { timezone } = useTimezone();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!value) {
    return <span data-testid="relative-time-empty">—</span>;
  }

  const absolute = formatAbsolute(value, timezone);
  const relative = now ? formatRelative(value, now) : null;

  return (
    <time dateTime={value} title={absolute} data-testid="relative-time">
      {relative ?? absolute}
      {relative && showAbsoluteInline ? ` · ${absolute}` : null}
    </time>
  );
}
