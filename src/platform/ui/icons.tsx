/** Thin 1.5px line icons for Agent Ops (HB geometry: rounded caps, 16px grid). Decorative unless titled. */
import type { ReactNode, SVGProps } from 'react';

type P = { size?: number; title?: string } & Omit<SVGProps<SVGSVGElement>, 'children'>;

function Svg({ size = 16, title, children, ...rest }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} {...rest}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconOverview = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="2" width="5" height="6" rx="1.2" />
    <rect x="9" y="2" width="5" height="3.5" rx="1.2" />
    <rect x="9" y="7.5" width="5" height="6.5" rx="1.2" />
    <rect x="2" y="10" width="5" height="4" rx="1.2" />
  </Svg>
);
export const IconRegistry = (p: P) => (
  <Svg {...p}>
    <path d="M8 2 14 5 8 8 2 5 8 2Z" />
    <path d="m2 8 6 3 6-3" />
    <path d="m2 11 6 3 6-3" />
  </Svg>
);
export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M1.8 13.5c.6-2.3 2.2-3.5 4.2-3.5s3.6 1.2 4.2 3.5" />
    <path d="M10.5 3.2a2.4 2.4 0 0 1 0 4.6M12 10.3c1.1.5 1.9 1.6 2.2 3.2" />
  </Svg>
);
export const IconLogs = (p: P) => (
  <Svg {...p}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
    <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" strokeWidth={2} />
  </Svg>
);
export const IconTrace = (p: P) => (
  <Svg {...p}>
    <path d="M2 3.5h6M4 6.5h7M6 9.5h4.5M8.5 12.5h5.5" />
  </Svg>
);
export const IconPulse = (p: P) => (
  <Svg {...p}>
    <path d="M1.5 8.5h3l1.7-4 3.3 8 1.8-4h3.2" />
  </Svg>
);
export const IconCost = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M10 5.8c-.4-.7-1.1-1-2-1-1.2 0-2 .6-2 1.5 0 2.2 4.2 1.1 4.2 3.4 0 .9-.9 1.6-2.2 1.6-1 0-1.8-.4-2.2-1.1M8 3.6v1.2M8 11.3v1.2" />
  </Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M8 1.8 13 3.6v4.1c0 3.2-2.2 5.4-5 6.5-2.8-1.1-5-3.3-5-6.5V3.6l5-1.8Z" />
    <path d="m5.8 8 1.6 1.6L10.4 6.4" />
  </Svg>
);
export const IconArrowRight = (p: P) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);
export const IconArrowUpRight = (p: P) => (
  <Svg {...p}>
    <path d="M5 11 11 5M6 5h5v5" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="m3.5 8.5 3 3 6-7" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M8 2.2 14.3 13H1.7L8 2.2Z" />
    <path d="M8 6.5v3M8 11.4h.01" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.6V8l2.3 1.5" />
  </Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 7.2v4M8 4.9h.01" />
  </Svg>
);
export const IconSliders = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" />
    <circle cx="10" cy="4.5" r="1.5" />
    <circle cx="6" cy="11.5" r="1.5" />
  </Svg>
);
export const IconPrint = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2" />
    <rect x="4.5" y="9.5" width="7" height="4" rx=".6" />
  </Svg>
);
export const IconDoc = (p: P) => (
  <Svg {...p}>
    <path d="M4 1.8h5.2L12.5 5v9.2H4Z" />
    <path d="M9 1.8V5h3.5M6 8h4.5M6 10.5h4.5" />
  </Svg>
);
export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path d="M9 1.8 3.5 9h4L7 14.2 12.5 7h-4L9 1.8Z" />
  </Svg>
);
export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 3c2-.6 3.8-.4 5.5.8v9.5c-1.7-1.2-3.5-1.4-5.5-.8V3ZM13.5 3c-2-.6-3.8-.4-5.5.8v9.5c1.7-1.2 3.5-1.4 5.5-.8V3Z" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" />
  </Svg>
);
export const IconEye = (p: P) => (
  <Svg {...p}>
    <path d="M1.5 8S3.8 3.5 8 3.5 14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);
export const IconSpark = (p: P) => (
  <Svg {...p}>
    <path d="M8 2v3M8 11v3M2 8h3M11 8h3M3.8 3.8l2 2M10.2 10.2l2 2M12.2 3.8l-2 2M5.8 10.2l-2 2" />
  </Svg>
);
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M5 3.2v9.6L12.5 8 5 3.2Z" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </Svg>
);
export const IconAgent = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="10" height="8" rx="2.5" />
    <path d="M8 2v2.5M6 8.2h.01M10 8.2h.01M6.2 10.6h3.6" />
  </Svg>
);
