/**
 * The design system's icon set: one grammar for every glyph (24-unit grid, 1.6 stroke, round
 * caps and joins, currentColor). 16px by default; 14px inside small buttons and badges.
 * Third-party marks live in ConnectorMark, never here.
 */
import type { ReactNode, SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: number; title?: string };

function Svg({ size = 16, title, children, strokeWidth = 1.6, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

const make = (paths: ReactNode) => (p: IconProps) => <Svg {...p}>{paths}</Svg>;

export const IconInbox = make(
  <>
    <path d="M4 13.5 6.2 5.6A2 2 0 0 1 8.1 4h7.8a2 2 0 0 1 1.9 1.6L20 13.5" />
    <path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5h-4.5a3.5 3.5 0 0 1-7 0z" />
  </>,
);
export const IconHome = make(
  <>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
  </>,
);
export const IconGrid = make(
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>,
);
export const IconPlus = make(<path d="M12 5v14M5 12h14" />);
export const IconMinus = make(<path d="M5 12h14" />);
export const IconUpload = make(
  <>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </>,
);
export const IconDownload = make(
  <>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </>,
);
export const IconFile = make(
  <>
    <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
    <path d="M14 3.5v5h5" />
  </>,
);
export const IconFileText = make(
  <>
    <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
    <path d="M14 3.5v5h5M9 13h6M9 16.5h4" />
  </>,
);
export const IconFolder = make(<path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />);
export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </>,
);
export const IconFilter = make(<path d="M4 6h16M7 12h10M10 18h4" />);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconCheckCircle = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.2 2.4 2.4 4.8-5" />
  </>,
);
export const IconX = make(<path d="M6 6l12 12M18 6 6 18" />);
export const IconXCircle = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
  </>,
);
export const IconAlertTriangle = make(
  <>
    <path d="M10.3 4.6 3.4 17a2 2 0 0 0 1.7 3h13.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 16.8v.2" />
  </>,
);
export const IconAlertCircle = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4.5M12 15.8v.2" />
  </>,
);
export const IconInfo = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8v.2" />
  </>,
);
export const IconHelp = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.6M12 16.8v.2" />
  </>,
);
export const IconChevronDown = make(<path d="m7 10 5 5 5-5" />);
export const IconChevronUp = make(<path d="m7 14 5-5 5 5" />);
export const IconChevronRight = make(<path d="m10 7 5 5-5 5" />);
export const IconChevronLeft = make(<path d="m14 7-5 5 5 5" />);
export const IconChevronsUpDown = make(<path d="m8 9 4-4 4 4M8 15l4 4 4-4" />);
export const IconArrowRight = make(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconArrowLeft = make(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const IconArrowUp = make(<path d="M12 19V5M6 11l6-6 6 6" />);
export const IconArrowDown = make(<path d="M12 5v14M6 13l6 6 6-6" />);
export const IconExternal = make(
  <>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </>,
);
export const IconMore = make(
  <>
    <circle cx="6" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18" cy="12" r="1" fill="currentColor" />
  </>,
);
export const IconSettings = make(
  <>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </>,
);
export const IconUsers = make(
  <>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M3 19.5a6 6 0 0 1 12 0" />
    <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.4a6 6 0 0 1 3.5 5.1" />
  </>,
);
export const IconUser = make(
  <>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </>,
);
export const IconUserPlus = make(
  <>
    <circle cx="10" cy="8.5" r="3.5" />
    <path d="M3.5 19.5a6.5 6.5 0 0 1 11.5-4.1M19 14v6M16 17h6" />
  </>,
);
export const IconPlug = make(
  <>
    <path d="M9 3.5v4M15 3.5v4" />
    <path d="M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0z" />
    <path d="M12 16.5v4" />
  </>,
);
export const IconSparkle = make(
  <path d="M12 4.5c.5 3.6 2.4 5.5 6 6-3.6.5-5.5 2.4-6 6-.5-3.6-2.4-5.5-6-6 3.6-.5 5.5-2.4 6-6zM18.5 3.5v3M20 5h-3M5.5 17.5v3M7 19H4" />,
);
export const IconLayers = make(
  <>
    <path d="m12 4 8.5 4.5L12 13 3.5 8.5z" />
    <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
  </>,
);
export const IconRoute = make(
  <>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
  </>,
);
export const IconSend = make(
  <>
    <path d="M20.5 3.5 10.6 13.4" />
    <path d="m20.5 3.5-6.3 17-3.6-7.1-7.1-3.6z" />
  </>,
);
export const IconLoop = make(
  <>
    <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L19.5 9" />
    <path d="M19.5 4.5V9H15" />
    <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4.5 15" />
    <path d="M4.5 19.5V15H9" />
  </>,
);
export const IconRefresh = IconLoop;
export const IconBeaker = make(
  <>
    <path d="M9.5 3.5h5M10 3.5v5.2L4.8 17.6A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 1.7-2.9L14 8.7V3.5" />
    <path d="M7.5 14.5h9" />
  </>,
);
export const IconGauge = make(
  <>
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="m12 17 4-5.5" />
    <path d="M4 17h1.5M18.5 17H20" />
  </>,
);
export const IconActivity = make(<path d="M3.5 12h3.5l2.5-6.5 5 13 2.5-6.5h3.5" />);
export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>,
);
export const IconPlay = make(<path d="M8 5.5v13l10.5-6.5z" />);
export const IconPause = make(<path d="M8.5 5.5v13M15.5 5.5v13" />);
export const IconCopy = make(
  <>
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
  </>,
);
export const IconLink = make(
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>,
);
export const IconUnlink = make(
  <>
    <path d="M15.5 13.5l3.2-3.2a4 4 0 0 0-5.7-5.7L10.5 7" />
    <path d="M8.5 10.5 5.3 13.7a4 4 0 0 0 5.7 5.7l2.5-2.5" />
    <path d="M4 4l16 16" />
  </>,
);
export const IconEye = make(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
);
export const IconPencil = make(
  <>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </>,
);
export const IconTrash = make(
  <>
    <path d="M4.5 7h15M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
  </>,
);
export const IconShield = make(
  <>
    <path d="M12 3.5 5 6v5.5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </>,
);
export const IconLock = make(
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>,
);
export const IconBolt = make(<path d="M13 3.5 5.5 13.5H12l-1 7 7.5-10H12z" />);
export const IconMail = make(
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </>,
);
export const IconMessage = make(<path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-4.3A7.5 7.5 0 1 1 20 12.5z" />);
export const IconTicket = make(
  <>
    <path d="M4 8a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v2.5a1.5 1.5 0 0 0 0 3V16a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-2.5a1.5 1.5 0 0 0 0-3z" />
    <path d="M14 6.5v11" strokeDasharray="1.5 2.5" />
  </>,
);
export const IconBook = make(
  <>
    <path d="M5 5.5A2 2 0 0 1 7 3.5h12v14H7a2 2 0 0 0-2 2z" />
    <path d="M5 19.5a2 2 0 0 0 2 2h12v-4" />
  </>,
);
export const IconPhone = make(
  <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />,
);
export const IconMic = make(
  <>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3" />
  </>,
);
export const IconWaveform = make(<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3" />);
export const IconLogOut = make(
  <>
    <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
    <path d="M10 8 6 12l4 4M6 12h10" />
  </>,
);
export const IconMenu = make(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconSidebar = make(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.5 4.5v15" />
  </>,
);
export const IconCommand = make(
  <path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0v11m0-11h6m-6 11a2.5 2.5 0 1 1-2.5-2.5H9zm0 0h6m0-11A2.5 2.5 0 1 1 17.5 9H15zm0 0v11m0 0a2.5 2.5 0 1 0 2.5-2.5H15z" />,
);
export const IconQuote = make(
  <path d="M6 17.5c2.5-.5 4-2.6 4-5.5V7H5v5h3M15 17.5c2.5-.5 4-2.6 4-5.5V7h-5v5h3" />,
);
export const IconBarChart = make(<path d="M5 20V11M10 20V5M15 20v-7M20 20V9M3.5 20h17" />);
export const IconDatabase = make(
  <>
    <ellipse cx="12" cy="6" rx="7" ry="2.5" />
    <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
  </>,
);
export const IconCpu = make(
  <>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
    <path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3" />
  </>,
);
export const IconBranch = make(
  <>
    <circle cx="6.5" cy="5.5" r="2" />
    <circle cx="6.5" cy="18.5" r="2" />
    <circle cx="17.5" cy="8.5" r="2" />
    <path d="M6.5 7.5v9M17.5 10.5c0 4-5 3-9.5 6" />
  </>,
);
export const IconTag = make(
  <>
    <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7.1 7.1a1.4 1.4 0 0 1-2 0z" />
    <circle cx="8.5" cy="8.5" r="1.3" />
  </>,
);
export const IconAt = make(
  <>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.3 6.7" />
  </>,
);
export const IconCalendar = make(
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
  </>,
);
export const IconDot = make(<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />);
export const IconKeyboard = make(
  <>
    <rect x="3" y="6.5" width="18" height="11" rx="2" />
    <path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17 10.5h.01M8 14h8" />
  </>,
);
export const IconBuilding = make(
  <>
    <path d="M5 20.5V5.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15M16 9.5h2a2 2 0 0 1 2 2v9M3.5 20.5h17" />
    <path d="M8.5 7.5h3M8.5 11h3M8.5 14.5h3" />
  </>,
);
export const IconLanguage = make(
  <>
    <path d="M4 5.5h9M8.5 3.5v2M6 5.5c0 4 2.5 7 6 8.5M11 5.5c0 3.5-3 7-7 8.5" />
    <path d="m12.5 20.5 4-9 4 9M14 17.5h5" />
  </>,
);
export const IconScale = make(
  <>
    <path d="M12 4v16M7 20h10M5 7.5h14" />
    <path d="m5 7.5-2.5 6a3 3 0 0 0 5 0zM19 7.5l-2.5 6a3 3 0 0 0 5 0z" />
  </>,
);
