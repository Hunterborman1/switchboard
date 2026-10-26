/**
 * Marks. Product marks are one family: a flat Invoca-green tile (24-unit square, radius 6)
 * with a white glyph. Connector marks are tiles in each tool's own colour with a simple
 * generic glyph that evokes it; they are never copies of the vendors' logos.
 */
import type { ReactNode } from 'react';

export type ProductKey = 'switchboard' | 'signal-loop' | 'agent-ops';

export const PRODUCT_NAME: Record<ProductKey, string> = {
  switchboard: 'Switchboard',
  'signal-loop': 'Signal Loop',
  'agent-ops': 'Agent Ops',
};

const GLYPH: Record<ProductKey, ReactNode> = {
  // Many lines in, one point of decision, the right lines out.
  switchboard: (
    <g stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M5.5 7.5c3 0 3.5 4.5 6.5 4.5M5.5 16.5c3 0 3.5-4.5 6.5-4.5M5.5 12H12" />
      <path d="M12 12c3 0 3.5-4.5 6.5-4.5M12 12c3 0 3.5 4.5 6.5 4.5" />
      <circle cx="12" cy="12" r="1.6" fill="#fff" stroke="none" />
    </g>
  ),
  'signal-loop': <path d="M7 10.5v3M10.33 8v8M13.67 6.5v11M17 9.5v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />,
  'agent-ops': (
    <g stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none">
      <circle cx="8" cy="8" r="1.9" />
      <circle cx="16" cy="8" r="1.9" />
      <circle cx="8" cy="16" r="1.9" />
      <circle cx="16" cy="16" r="1.9" fill="#fff" />
      <path d="M9.9 8h4.2M8 9.9v4.2M9.9 16h4.2M16 9.9v4.2" />
    </g>
  ),
};

export function ProductMark({ product, size = 20, title }: { product: ProductKey; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} style={{ flex: 'none', display: 'block' }}>
      {title ? <title>{title}</title> : null}
      <rect width="24" height="24" rx="6" fill="#008463" />
      {GLYPH[product]}
    </svg>
  );
}

/** The Signal Loop glyph alone, in currentColor, for use as a nav icon. */
export function SignalLoopGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M5.5 10v4M9.83 7v10M14.17 5v14M18.5 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------- connectors

type ConnectorStyle = { bg: string; glyph: ReactNode };

const W = { stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

const CONNECTOR: Record<string, ConnectorStyle> = {
  slack: { bg: '#4A154B', glyph: <path {...W} d="M9.5 6v12M14.5 6v12M6 9.5h12M6 14.5h12" /> },
  teams: { bg: '#4B53BC', glyph: <path {...W} d="M7 7.5h10M12 7.5v10" /> },
  jira: {
    bg: '#0052CC',
    glyph: (
      <g {...W}>
        <path d="M12 5.5 18.5 12 12 18.5 5.5 12z" />
        <path d="M12 9.5 14.5 12 12 14.5 9.5 12z" fill="#fff" stroke="none" />
      </g>
    ),
  },
  linear: {
    bg: '#5E6AD2',
    glyph: (
      <g {...W}>
        <circle cx="12" cy="12" r="6.5" />
        <path d="M7.5 15.5 15.5 7.5M9.5 17.5l8-8" />
      </g>
    ),
  },
  salesforce: { bg: '#0B8BD0', glyph: <path {...W} d="M8 16.5h8.5a3 3 0 0 0 .4-6A4 4 0 0 0 9.4 9 3.6 3.6 0 0 0 8 16.5z" /> },
  gmail: {
    bg: '#C5221F',
    glyph: (
      <g {...W}>
        <rect x="5.5" y="7.5" width="13" height="9.5" rx="1.5" />
        <path d="m6 8.5 6 4.5 6-4.5" />
      </g>
    ),
  },
  google_drive: { bg: '#188038', glyph: <path {...W} d="M9.5 5.5h5l5 8.5-2.5 4.5h-10L4.5 14z M9.5 5.5 14.5 14h5M7 18.5l5-8.5" /> },
  gong: { bg: '#7A3BD8', glyph: <path {...W} d="M6 11v2M9 8.5v7M12 6v12M15 8.5v7M18 11v2" /> },
  zoom: {
    bg: '#2D6BEA',
    glyph: (
      <g {...W}>
        <rect x="5" y="8" width="10" height="8" rx="2" />
        <path d="m15 11 4-2.5v7L15 13" />
      </g>
    ),
  },
  zendesk: { bg: '#03363D', glyph: <path {...W} d="M7 7.5h10L7 16.5h10" /> },
  hubspot: {
    bg: '#E8603C',
    glyph: (
      <g {...W}>
        <circle cx="13" cy="13.5" r="3.2" />
        <path d="M13 10.3V6.5M10.7 15.8 7 18.5M7.5 8l3.3 3.4" />
      </g>
    ),
  },
  notion: { bg: '#1F1F1F', glyph: <path {...W} d="M8 17.5v-11l8 11v-11" /> },
  // manual routes in
  upload: { bg: '#525C57', glyph: <path {...W} d="M12 15.5v-9M8.5 10 12 6.5l3.5 3.5M6.5 17.5h11" /> },
  paste: { bg: '#525C57', glyph: <path {...W} d="M9 6.5h6M8 8.5h8v10H8zM10.5 12h3M10.5 15h3" /> },
  library: { bg: '#525C57', glyph: <path {...W} d="M6.5 6v12M10 6v12M13.5 7l3.5 11" /> },
  triage: { bg: '#525C57', glyph: <path {...W} d="M6 8h12M8 12h8M10 16h4" /> },
};

export function ConnectorMark({ id, size = 24, title }: { id: string; size?: number; title?: string }) {
  const s = CONNECTOR[id] ?? CONNECTOR.upload!;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} style={{ flex: 'none', display: 'block' }}>
      {title ? <title>{title}</title> : null}
      <rect width="24" height="24" rx={size <= 20 ? 5 : 6} fill={s.bg} />
      {s.glyph}
    </svg>
  );
}
