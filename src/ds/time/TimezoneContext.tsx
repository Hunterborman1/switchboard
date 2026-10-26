
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ConsoleTimezone } from "./format";

const STORAGE_KEY = "uis-console-timezone";
const DEFAULT_TIMEZONE: ConsoleTimezone = "UTC";

interface TimezoneContextValue {
  timezone: ConsoleTimezone;
  setTimezone(timezone: ConsoleTimezone): void;
}

const TimezoneContext = createContext<TimezoneContextValue>({
  timezone: DEFAULT_TIMEZONE,
  setTimezone: () => {},
});

function readStoredTimezone(): ConsoleTimezone {
  if (typeof window === "undefined") return DEFAULT_TIMEZONE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "America/Los_Angeles" ? stored : DEFAULT_TIMEZONE;
}

/**
 * Provides the console-wide timezone toggle (UTC default, per the design
 * system's "Timestamps are UTC by default with a toggle to
 * America/Los_Angeles" rule). Every RelativeTime/DataAsOf instance reads
 * from this context rather than each maintaining its own toggle state, so
 * flipping the toggle once (see the sidebar footer's <TimezoneToggle />)
 * updates every timestamp on the page at once.
 */
export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<ConsoleTimezone>(DEFAULT_TIMEZONE);

  useEffect(() => {
    setTimezoneState(readStoredTimezone());
  }, []);

  const value = useMemo<TimezoneContextValue>(
    () => ({
      timezone,
      setTimezone: (next: ConsoleTimezone) => {
        setTimezoneState(next);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, next);
        }
      },
    }),
    [timezone],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

export function useTimezone(): TimezoneContextValue {
  return useContext(TimezoneContext);
}
