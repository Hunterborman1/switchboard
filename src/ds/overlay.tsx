/**
 * Things that float: tooltip, menu, popover, dialog, drawer, toasts. Built on Floating UI so
 * placement, focus management, dismissal and portals behave the same everywhere.
 */
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  size as sizeMw,
  useClick,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useListNavigation,
  useRole,
  type Placement,
} from '@floating-ui/react';
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { IconAlertTriangle, IconCheckCircle, IconInfo, IconX, IconXCircle } from './icons';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Overlays mount inside the themed app root so tokens and fonts apply. */
function portalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return (document.querySelector('[data-ds-portal]') as HTMLElement | null) ?? document.body;
}

// ---------------------------------------------------------------- tooltip

export function Tooltip({ label, children, placement = 'top', disabled }: { label: ReactNode; children: ReactElement; placement?: Placement; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open: open && !disabled,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    // Fixed: triggers live in a sticky sidebar and top bar; focusing an absolutely placed
    // popover would scroll the page to it.
    strategy: 'fixed',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const hover = useHover(context, { delay: { open: 350, close: 0 }, move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  if (!isValidElement(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  return (
    <>
      {cloneElement(child, { ref: refs.setReference, ...getReferenceProps(child.props) })}
      {open && !disabled && label ? (
        <FloatingPortal root={portalRoot()}>
          <div ref={refs.setFloating} className="ds-tooltip" style={floatingStyles} {...getFloatingProps()}>
            {label}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- menu

export type MenuItem =
  | { kind?: 'item'; label: ReactNode; sub?: ReactNode; icon?: ReactNode; onSelect: () => void; checked?: boolean; disabled?: boolean; danger?: boolean }
  | { kind: 'label'; label: ReactNode }
  | { kind: 'separator' };

/**
 * A button that opens a list of actions. Arrow keys move, Enter selects, Esc closes and
 * returns focus to the trigger.
 */
export function Menu({ trigger, items, placement = 'bottom-end', width, label }: { trigger: ReactElement; items: MenuItem[]; placement?: Placement; width?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<(HTMLElement | null)[]>([]);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    // Fixed: triggers live in a sticky sidebar and top bar; focusing an absolutely placed
    // popover would scroll the page to it.
    strategy: 'fixed',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const nav = useListNavigation(context, { listRef, activeIndex: active, onNavigate: setActive, loop: true });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([click, dismiss, role, nav]);
  const child = trigger as ReactElement<Record<string, unknown>>;
  let idx = -1;
  return (
    <>
      {cloneElement(child, { ref: refs.setReference, 'aria-haspopup': 'menu', 'aria-expanded': open, ...getReferenceProps(child.props) })}
      {open ? (
        <FloatingPortal root={portalRoot()}>
          <FloatingFocusManager context={context} modal={false} initialFocus={0}>
            <div ref={refs.setFloating} className="ds-popover" style={{ ...floatingStyles, ...(width ? { width } : {}) }} aria-label={label} {...getFloatingProps()}>
              {items.map((it, i) => {
                if (it.kind === 'separator') return <div key={`s${i}`} className="ds-menu__sep" role="separator" />;
                if (it.kind === 'label') return <div key={`l${i}`} className="ds-menu__label">{it.label}</div>;
                idx++;
                const my = idx;
                return (
                  <button
                    key={`i${i}`}
                    type="button"
                    role="menuitem"
                    className="ds-menu__item"
                    data-active={active === my}
                    disabled={it.disabled}
                    style={it.danger ? { color: 'var(--danger)' } : undefined}
                    tabIndex={active === my ? 0 : -1}
                    ref={(node) => {
                      listRef.current[my] = node;
                    }}
                    {...getItemProps({
                      onClick: () => {
                        it.onSelect();
                        setOpen(false);
                      },
                    })}
                  >
                    {it.icon}
                    <span className="ds-menu__item-text">
                      <span>{it.label}</span>
                      {it.sub ? <span className="ds-menu__item-sub">{it.sub}</span> : null}
                    </span>
                    {it.checked ? (
                      <svg className="ds-menu__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- popover (free content)

export function Popover({
  trigger,
  children,
  placement = 'bottom-start',
  width,
  open: controlled,
  onOpenChange,
}: {
  trigger: ReactElement;
  children: ReactNode | ((close: () => void) => ReactNode);
  placement?: Placement;
  width?: number;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlled ?? uncontrolled;
  const setOpen = (o: boolean) => {
    setUncontrolled(o);
    onOpenChange?.(o);
  };
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    // Fixed: triggers live in a sticky sidebar and top bar; focusing an absolutely placed
    // popover would scroll the page to it.
    strategy: 'fixed',
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      sizeMw({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(160, availableHeight)}px`;
        },
      }),
    ],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);
  const child = trigger as ReactElement<Record<string, unknown>>;
  return (
    <>
      {cloneElement(child, { ref: refs.setReference, 'aria-expanded': open, ...getReferenceProps(child.props) })}
      {open ? (
        <FloatingPortal root={portalRoot()}>
          <FloatingFocusManager context={context} modal={false}>
            <div ref={refs.setFloating} className="ds-popover" style={{ ...floatingStyles, overflowY: 'auto', ...(width ? { width, maxWidth: width } : {}) }} {...getFloatingProps()}>
              {typeof children === 'function' ? children(() => setOpen(false)) : children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- modal + drawer

function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [active]);
}

type OverlayProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Left side of the footer (status text). */
  footerStart?: ReactNode;
  width?: number;
  /** Attributes for the panel (e.g. a walkthrough anchor). */
  attrs?: Record<string, string>;
  /** Close on scrim click. @default true */
  dismissible?: boolean;
  initialFocus?: number | React.MutableRefObject<HTMLElement | null>;
};

function useOverlay(open: boolean, onClose: () => void, dismissible: boolean) {
  const { refs, context } = useFloating({ open, onOpenChange: (o) => !o && onClose() });
  const dismiss = useDismiss(context, { outsidePress: false, escapeKey: true });
  const role = useRole(context, { role: 'dialog' });
  const { getFloatingProps } = useInteractions([dismiss, role]);
  useLockScroll(open);
  return { refs, context, getFloatingProps, onScrim: dismissible ? onClose : undefined };
}

export function Modal({ open, onClose, title, description, children, footer, footerStart, width, attrs, dismissible = true, initialFocus }: OverlayProps) {
  const titleId = useId();
  const descId = useId();
  const { refs, context, getFloatingProps, onScrim } = useOverlay(open, onClose, dismissible);
  if (!open) return null;
  return (
    <FloatingPortal root={portalRoot()}>
      <div className="ds-scrim" onClick={onScrim} aria-hidden="true" />
      <FloatingFocusManager context={context} initialFocus={initialFocus ?? 0} returnFocus>
        <div
          ref={refs.setFloating}
          className="ds-dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          style={width ? ({ ['--dialog-w' as string]: `${width}px` } as React.CSSProperties) : undefined}
          {...attrs}
          {...getFloatingProps()}
        >
          <div className="ds-dialog__header">
            <div style={{ minWidth: 0 }}>
              <h2 id={titleId} className="ds-dialog__title">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="ds-dialog__description">
                  {description}
                </p>
              ) : null}
            </div>
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon ds-dialog__close" aria-label="Close" onClick={onClose}>
              <IconX />
            </button>
          </div>
          {children ? <div className="ds-dialog__body">{children}</div> : null}
          {footer || footerStart ? (
            <div className="ds-dialog__footer">
              {footerStart ? <span className="ds-dialog__footer-start">{footerStart}</span> : null}
              {footer}
            </div>
          ) : null}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

export function Drawer({ open, onClose, title, description, children, footer, width, attrs, dismissible = true, initialFocus }: OverlayProps) {
  const titleId = useId();
  const { refs, context, getFloatingProps, onScrim } = useOverlay(open, onClose, dismissible);
  if (!open) return null;
  return (
    <FloatingPortal root={portalRoot()}>
      <div className="ds-scrim" onClick={onScrim} aria-hidden="true" />
      <FloatingFocusManager context={context} initialFocus={initialFocus ?? 0} returnFocus>
        <div
          ref={refs.setFloating}
          className="ds-drawer"
          aria-modal="true"
          aria-labelledby={titleId}
          style={width ? ({ ['--drawer-w' as string]: `${width}px` } as React.CSSProperties) : undefined}
          {...attrs}
          {...getFloatingProps()}
        >
          <div className="ds-drawer__header">
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id={titleId} className="ds-drawer__title">
                {title}
              </h2>
              {description ? <div className="ds-card__description">{description}</div> : null}
            </div>
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon" aria-label="Close" onClick={onClose}>
              <IconX />
            </button>
          </div>
          <div className="ds-drawer__body">{children}</div>
          {footer ? <div className="ds-drawer__footer">{footer}</div> : null}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

// ---------------------------------------------------------------- toasts

export type ToastTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type ToastItem = { id: number; tone: ToastTone; title: ReactNode; body?: ReactNode; action?: ReactNode };
type ToastFn = (t: Omit<ToastItem, 'id'> & { ms?: number }) => void;

const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

const TOAST_ICON: Record<ToastTone, ReactNode> = {
  success: <IconCheckCircle />,
  warning: <IconAlertTriangle />,
  danger: <IconXCircle />,
  info: <IconInfo />,
  neutral: <IconInfo />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback<ToastFn>(({ ms = 4200, ...t }) => {
    const id = ++seq.current;
    setItems((cur) => [...cur.slice(-2), { id, ...t }]);
    window.setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), ms);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="ds-toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('ds-toast', `ds-toast--${t.tone}`)}>
            {TOAST_ICON[t.tone]}
            <div className="ds-toast__body">
              <div className="ds-toast__title">{t.title}</div>
              {t.body ? <div className="ds-toast__text">{t.body}</div> : null}
              {t.action ? <div style={{ marginTop: 6 }}>{t.action}</div> : null}
            </div>
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--sm ds-btn--icon" style={{ margin: '-4px -8px -4px 0' }} aria-label="Dismiss" onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}>
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
