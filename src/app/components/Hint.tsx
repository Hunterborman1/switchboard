import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  safePolygon,
  type Placement,
} from '@floating-ui/react';

/**
 * Tooltip that wraps long copy and stays on screen (HB Tooltip is single-line, nowrap).
 * Hover or keyboard focus opens it; Esc closes. Same dark-chrome look as HB's tooltip.
 */
export function Hint({
  label,
  children,
  placement = 'top',
  maxWidth = 300,
}: {
  label: ReactNode;
  children: ReactElement;
  placement?: Placement;
  maxWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 10 }), shift({ padding: 10 })],
  });
  const hover = useHover(context, { delay: { open: 120, close: 60 }, handleClose: safePolygon() });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  return (
    <>
      {cloneElement(child, { ref: refs.setReference, ...getReferenceProps(child.props) })}
      {open ? (
        <div
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            zIndex: 95,
            maxWidth,
            padding: '7px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--cn-green-mid)',
            color: 'var(--text-on-dark)',
            fontSize: 'var(--fs-caption)',
            lineHeight: 1.45,
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none',
          }}
          {...getFloatingProps()}
        >
          {label}
        </div>
      ) : null}
    </>
  );
}
