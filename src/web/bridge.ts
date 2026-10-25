/**
 * Guarded bridges into modules owned by other parts of the build (product UI, Agent Ops).
 * `import.meta.glob` keeps the build green before a module exists and picks it up the
 * moment it does — no hard import edges from the walkthrough into the product.
 */
import type { ComponentType, ReactNode } from 'react';
import type { RouteObject } from 'react-router-dom';
import type { UsageKind } from '../shared/platform-contracts';

type AppIndex = {
  AppShell?: ComponentType<{ children?: ReactNode }>;
  appRoutes?: RouteObject[];
  setTourState?: (s: { tourActive?: boolean; pace?: number }) => void;
};
type PlatformIndex = {
  PlatformShell?: ComponentType<{ children?: ReactNode }>;
  platformRoutes?: RouteObject[];
};
type AppRoutesMod = { appRoutes?: RouteObject[] };
type StateMod = { setTourState?: AppIndex['setTourState']; refreshTourStateFromUrl?: () => void };
type TelemetryMod = { track?: (kind: UsageKind, props?: Record<string, unknown>, durationMs?: number | null) => void };

const first = <T,>(r: Record<string, T>): T | undefined => Object.values(r)[0];

const appIndex = first(import.meta.glob<AppIndex>('../app/index.ts', { eager: true }));
const appRoutesMod = first(import.meta.glob<AppRoutesMod>('../app/routes.tsx', { eager: true }));
const stateMod = first(import.meta.glob<StateMod>('../app/state.ts', { eager: true }));
const telemetryMod = first(import.meta.glob<TelemetryMod>('../app/telemetry.ts', { eager: true }));
const platformIndex = first(import.meta.glob<PlatformIndex>('../platform/index.ts', { eager: true }));

export const AppShell = appIndex?.AppShell ?? null;
export const appRoutes: RouteObject[] = appIndex?.appRoutes ?? appRoutesMod?.appRoutes ?? [];
export const PlatformShell = platformIndex?.PlatformShell ?? null;
export const platformRoutes: RouteObject[] = platformIndex?.platformRoutes ?? [];

export const setProductTourState = (s: { tourActive?: boolean; pace?: number }) => {
  try {
    (appIndex?.setTourState ?? stateMod?.setTourState)?.(s);
  } catch {
    /* product not ready */
  }
};
export const refreshProductTourState = () => {
  try {
    stateMod?.refreshTourStateFromUrl?.();
  } catch {
    /* ignore */
  }
};

export const trackUsage = (kind: UsageKind, props: Record<string, unknown> = {}) => {
  try {
    telemetryMod?.track?.(kind, props, null);
  } catch {
    /* telemetry must never break the tour */
  }
};
