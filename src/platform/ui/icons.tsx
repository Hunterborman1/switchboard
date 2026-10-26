/**
 * The few Agent Ops glyphs the design system's icon set does not have, drawn in its grammar
 * (24-unit grid, 1.6 stroke, round caps and joins, currentColor). Everything else comes from
 * src/ds/icons.
 */
import type { ReactNode } from 'react';
import type { IconProps } from '../../ds/icons';

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

/** Cost: a coin with a dollar sign. */
export const IconCoin = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.6 9.2c-.5-.8-1.5-1.3-2.6-1.3-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2.1c1.5.4 2.6.9 2.6 2.1s-1.1 2-2.6 2c-1.2 0-2.2-.5-2.7-1.4M12 6.5v1.4M12 16.1v1.4" />
  </Svg>
);

/** A trace: staggered bars on a shared clock. */
export const IconTrace = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h9M7 12h10M10 18h10" />
  </Svg>
);

export const IconPrint = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V4.5h10V9M7 17H5.5A1.5 1.5 0 0 1 4 15.5v-5A1.5 1.5 0 0 1 5.5 9h13a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17" />
    <path d="M7 14h10v6H7z" />
  </Svg>
);
