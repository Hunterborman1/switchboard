/**
 * Product glyphs HB's icon set does not carry (files, folders, channels, pipeline steps).
 * Same grammar as HB Icon: 24-unit grid, 1.5px stroke, round caps, currentColor.
 * Channel icons are generic shapes, never third-party logos.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number; title?: string };

function Svg({ size = 16, title, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconFolder = (p: P) => (
  <Svg {...p}>
    <path d="M3 7.5a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
export const IconFolderOpen = (p: P) => (
  <Svg {...p}>
    <path d="M3 17V7.5a2 2 0 0 1 2-2h3.6l2 2H17a2 2 0 0 1 2 2V11" />
    <path d="M3 17l2.4-5.2A1.5 1.5 0 0 1 6.8 11H21l-2.6 6.4a1.5 1.5 0 0 1-1.4.9H4.5A1.5 1.5 0 0 1 3 17z" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Svg>
);
export const IconPaste = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="4" width="12" height="17" rx="2" />
    <path d="M9 4.5V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v1M9 10h6M9 13.5h6M9 17h3.5" />
  </Svg>
);
export const IconDrop = (p: P) => (
  <Svg {...p}>
    <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    <path d="M12 3v11M8 10l4 4 4-4" />
  </Svg>
);
export const IconLibrary = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="4" height="16" rx="1" />
    <rect x="9.5" y="4" width="4" height="16" rx="1" />
    <path d="m16 5.2 3.6-.9 3 15.4-3.6.9z" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.2 3 7.7 7 9.5 4-1.8 7-5.3 7-9.5V6z" />
  </Svg>
);
export const IconShieldAlert = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 5 6v5.5c0 4.2 3 7.7 7 9.5 4-1.8 7-5.3 7-9.5V6z" />
    <path d="M12 8.5v4M12 15.5v.01" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
);
export const IconQuote = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 7C6.5 7.6 5 9.8 5 13v4h4.5v-4.5H7.2c.1-1.7 1-2.8 2.6-3.3zM18.5 7c-3 .6-4.5 2.8-4.5 6v4h4.5v-4.5h-2.3c.1-1.7 1-2.8 2.6-3.3z" />
  </Svg>
);
export const IconHash = (p: P) => (
  <Svg {...p}>
    <path d="M9 4 7.5 20M16.5 4 15 20M4.5 9h15.5M4 15h15.5" />
  </Svg>
);
export const IconTicket = (p: P) => (
  <Svg {...p}>
    <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5z" />
    <path d="M14.5 5.5v13" strokeDasharray="1.6 2.4" />
  </Svg>
);
export const IconIssue = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconMail = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Svg>
);
export const IconInbox = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 13.5 6 5.5h12l2.5 8V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    <path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" />
  </Svg>
);
export const IconRoute = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M8 18h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16" />
  </Svg>
);
export const IconTheme = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="9" r="3" />
    <circle cx="16.5" cy="8" r="2.2" />
    <circle cx="14" cy="16" r="3.5" />
  </Svg>
);
export const IconBeaker = (p: P) => (
  <Svg {...p}>
    <path d="M9 3.5h6M10 3.5V9l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3.5" />
    <path d="M7.5 15h9" />
  </Svg>
);
export const IconPulse = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </Svg>
);
export const IconRuns = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M7 9h2M11 9h6M7 12.5h2M11 12.5h6M7 16h2M11 16h4" />
  </Svg>
);
export const IconReview = (p: P) => (
  <Svg {...p}>
    <path d="M4 5.5h10M4 10h7M4 14.5h5" />
    <path d="m13 17 2.5 2.5L21 14" />
  </Svg>
);
export const IconSpark = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9L4.5 10.8 10.2 9z" />
  </Svg>
);
export const IconChannels = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="4" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="4" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13" width="7" height="7" rx="1.5" />
    <path d="M17 13.5v6M14 16.5h6" />
  </Svg>
);
export const IconLoop = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9" />
    <path d="M19.5 4.5V9H15" />
    <path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15" />
    <path d="M4.5 19.5V15H9" />
  </Svg>
);
export const IconGauge = (p: P) => (
  <Svg {...p}>
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="m12 17 4-5" />
  </Svg>
);
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M5 4v16M12 4v16M19 4v16" />
    <circle cx="5" cy="15" r="2" fill="var(--sl-icon-fill, transparent)" />
    <circle cx="12" cy="8" r="2" fill="var(--sl-icon-fill, transparent)" />
    <circle cx="19" cy="13" r="2" fill="var(--sl-icon-fill, transparent)" />
  </Svg>
);
export const IconOps = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Svg>
);
export const IconArrowUpRight = (p: P) => (
  <Svg {...p}>
    <path d="M7 17 17 7M8.5 7H17v8.5" />
  </Svg>
);
export const IconSortAsc = (p: P) => (
  <Svg {...p}>
    <path d="m8 14 4-4 4 4" />
  </Svg>
);
export const IconSortDesc = (p: P) => (
  <Svg {...p}>
    <path d="m8 10 4 4 4-4" />
  </Svg>
);
export const IconChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10.5-6.5z" />
  </Svg>
);
export const IconReplay = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
    <path d="M4.5 4.5V9H9" />
  </Svg>
);
export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);
export const IconListView = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20M4 6.5h.01M4 12h.01M4 17.5h.01" />
  </Svg>
);
export const IconUser = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Svg>
);
export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z" />
  </Svg>
);
export const IconCopy = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
  </Svg>
);
export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M13.5 4.5H19.5V10.5M19.5 4.5l-8 8" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Svg>
);

/** File-type badge: a document silhouette with the format in mono caps. */
export function FileGlyph({ format, size = 28 }: { format: string; size?: number }) {
  const tone: Record<string, string> = {
    vtt: 'var(--cn-green-deep)',
    txt: 'var(--cn-info)',
    md: 'var(--cn-chart-2)',
    eml: '#4B5FCB',
    chat: 'var(--cn-chart-6)',
  };
  const color = tone[format] ?? 'var(--cn-neutral)';
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <path d="M7 2.5h9.5L22 8v16.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 6 24.5v-20.5A1.5 1.5 0 0 1 7 2.5z" fill="var(--cn-white)" stroke="var(--cn-border-strong)" />
      <path d="M16.5 2.5V7a1 1 0 0 0 1 1H22" fill="none" stroke="var(--cn-border-strong)" />
      <rect x="3.5" y="14" width="17" height="8" rx="1.5" fill={color} />
      <text x="12" y="19.9" textAnchor="middle" fontSize="5.6" fontWeight="700" fontFamily="var(--font-mono)" fill="#fff" letterSpacing="0.3">
        {format.toUpperCase()}
      </text>
    </svg>
  );
}
