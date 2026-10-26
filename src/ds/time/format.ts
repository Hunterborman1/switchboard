// Shared, framework-free date/number/id formatting helpers used by
// components/RelativeTime.tsx, components/DataAsOf.tsx and
// components/MonoId.tsx. Kept pure (no React, no browser API beyond
// Intl, which exists in both Node and the browser) so every function here
// is directly unit-testable and reusable server- or client-side.

export type ConsoleTimezone = "UTC" | "America/Los_Angeles";

/** Formats an instant as "YYYY-MM-DD HH:MM:SS <TZ_ABBR>" in the given
 * timezone -- e.g. "2026-08-05 14:20:11 UTC" or the Los_Angeles equivalent.
 * Used for the absolute-time half of RelativeTime's hover/tooltip and for
 * DataAsOf's header line. */
export function formatAbsolute(instant: Date | string, timezone: ConsoleTimezone): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const datePart = `${get("year")}-${get("month")}-${get("day")}`;
  const timePart = `${get("hour")}:${get("minute")}:${get("second")}`;
  const tzName = get("timeZoneName") || (timezone === "UTC" ? "UTC" : "PT");
  return `${datePart} ${timePart} ${tzName}`;
}

/** Same as `formatAbsolute` but without seconds, for the DataAsOf header
 * line ("Data as of 2026-08-05 14:32 UTC"). */
export function formatAbsoluteMinutes(instant: Date | string, timezone: ConsoleTimezone): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const datePart = `${get("year")}-${get("month")}-${get("day")}`;
  const timePart = `${get("hour")}:${get("minute")}`;
  const tzName = get("timeZoneName") || (timezone === "UTC" ? "UTC" : "PT");
  return `${datePart} ${timePart} ${tzName}`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

// "always" (not "auto") + "narrow" gives exactly the design system's compact
// convention -- "12m ago", "2h ago", "1d ago" -- rather than Intl's special-
// cased "yesterday"/"tomorrow" (numeric: "auto") for the one-day case.
const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "always", style: "narrow" });

/** Renders "12m ago" / "in 5m" / "just now" style relative time, per the
 * design system's compact convention (e.g. "12m ago · 2026-08-05 14:20:11 UTC"). */
export function formatRelative(instant: Date | string, now: Date = new Date()): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (diffSeconds === 0) return "just now";

  const absSeconds = Math.abs(diffSeconds);
  for (const [unit, unitSeconds] of RELATIVE_UNITS) {
    if (absSeconds >= unitSeconds || unit === "second") {
      const value = Math.round(diffSeconds / unitSeconds);
      return relativeFormatter.format(value, unit);
    }
  }
  return "just now";
}

/** Truncates a long id/hash to its first and last `keep` characters, joined
 * by an ellipsis -- e.g. "3fa85f64…f66afa6" -- for MonoId. Returns the
 * value unchanged when it's already short enough that truncating wouldn't
 * shorten it. */
export function truncateMiddle(value: string, keep = 8): string {
  if (value.length <= keep * 2 + 1) return value;
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Formats a byte count (accepts the string-encoded bigints the control-plane
 * row shapes use for bytes, e.g. `artifactBytes`/`totalBytes`) as a compact
 * human string -- "204.8 KB", "1.6 GB". Used anywhere an artifact/run/backup
 * byte count is rendered instead of a raw integer. */
export function formatBytes(value: string | number): string {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), BYTE_UNITS.length - 1);
  const scaled = bytes / Math.pow(1000, exponent);
  const precision = exponent === 0 ? 0 : 1;
  return `${scaled.toFixed(precision)} ${BYTE_UNITS[exponent]}`;
}

/** Formats a duration given in seconds (accepts the string-encoded numerics
 * the control-plane row shapes use, e.g. `recovery_evidence.controlPlaneSeconds`)
 * as a compact "1h 42m" / "6m 12s" string. Used by the Recovery surface's
 * objectives banner and restore-drill timelines. */
export function formatSecondsDuration(value: string | number | null): string {
  if (value === null) return "—";
  const totalSeconds = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Formats an integer count (accepts the string-encoded bigints the
 * control-plane row shapes use for counts, e.g. `rowCount`) with grouped
 * digits -- "14,733". Render inside a tabular-nums context (the design
 * system's numeric-column convention). Null/undecodable values render as
 * the em-dash placeholder. */
export function formatCount(value: string | number | null): string {
  if (value === null) return "—";
  const count = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(count)) return "—";
  return count.toLocaleString("en-US");
}

/** Formats a signed delta -- "+512", "-3", "0" -- for week-over-week growth
 * columns. Null (e.g. no 7-day baseline collected yet) renders as the
 * em-dash placeholder, distinct from a genuine zero. */
export function formatSignedCount(value: string | number | null): string {
  if (value === null) return "—";
  const count = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(count)) return "—";
  if (count === 0) return "0";
  const formatted = Math.abs(count).toLocaleString("en-US");
  return count > 0 ? `+${formatted}` : `-${formatted}`;
}

/** Formats a count as "actual / expected" with a computed percentage, per
 * the design system's rule that a percentage never appears without its
 * denominator -- e.g. "98.7% · 14,882 / 15,081". */
export function formatCountWithDenominator(actual: number, expected: number): string {
  const formattedActual = actual.toLocaleString("en-US");
  const formattedExpected = expected.toLocaleString("en-US");
  if (expected === 0) return `${formattedActual} / ${formattedExpected}`;
  const pct = ((actual / expected) * 100).toFixed(1);
  return `${pct}% · ${formattedActual} / ${formattedExpected}`;
}
