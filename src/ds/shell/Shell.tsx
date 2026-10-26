/**
 * The application frame shared by Switchboard and Agent Ops: sidebar (switcher, primary action,
 * grouped navigation, footer), a sticky top bar with breadcrumbs, and a drawer version of the
 * sidebar below 900px. Products pass their navigation; pages set extra breadcrumbs with
 * `useCrumbs`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FloatingFocusManager, FloatingPortal, useDismiss, useFloating, useInteractions } from '@floating-ui/react';
import { Link, NavLink, matchPath, useLocation } from 'react-router-dom';
import { IconMenu, IconX } from '../icons';
import '../shell.css';

export type NavItem = {
  to: string;
  label: string;
  icon?: ReactNode;
  /** Count shown at the end of the row (accent when `badgeTone` is 'accent'). */
  badge?: number | string | null;
  badgeTone?: 'accent' | 'quiet';
  badgeLabel?: string;
  end?: boolean;
  /** Extra path patterns that also mark this item active (detail pages). */
  match?: string[];
  attrs?: Record<string, string>;
};
export type NavGroup = { label?: ReactNode; icon?: ReactNode; items: NavItem[] };
export type Crumb = { label: ReactNode; to?: string };

type ShellCtxValue = { setCrumbs: (c: Crumb[] | null) => void };
const ShellCtx = createContext<ShellCtxValue | null>(null);

/** Set the trailing breadcrumbs for this page (after the section crumb the nav provides). */
export function useCrumbs(crumbs: Crumb[] | null, deps: unknown[] = []) {
  const ctx = useContext(ShellCtx);
  useEffect(() => {
    ctx?.setCrumbs(crumbs);
    return () => ctx?.setCrumbs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function isActive(item: NavItem, pathname: string): boolean {
  if (matchPath({ path: item.to, end: item.end ?? false }, pathname)) return true;
  return (item.match ?? []).some((p) => !!matchPath({ path: p, end: false }, pathname));
}

function NavRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const showBadge = item.badge !== null && item.badge !== undefined && item.badge !== 0 && item.badge !== '';
  return (
    <NavLink to={item.to} end={item.end} className={`ds-nav-item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onNavigate} {...item.attrs}>
      {item.icon}
      <span className="ds-nav-item__label">{item.label}</span>
      {showBadge ? (
        <span className={`ds-nav-item__badge${item.badgeTone === 'quiet' ? ' ds-nav-item__badge--quiet' : ''}`} aria-label={item.badgeLabel}>
          {item.badge}
        </span>
      ) : null}
    </NavLink>
  );
}

function SidebarBody({ switcher, action, groups, footer, pathname, onNavigate }: { switcher: ReactNode; action?: ReactNode; groups: NavGroup[]; footer?: ReactNode; pathname: string; onNavigate?: () => void }) {
  // One active item: the most specific match wins (e.g. /app/themes/:id over /app/themes).
  const activeTo = useMemo(() => {
    let best: string | null = null;
    for (const g of groups) for (const it of g.items) if (isActive(it, pathname) && (!best || it.to.length > best.length)) best = it.to;
    return best;
  }, [groups, pathname]);
  return (
    <>
      <div className="ds-sidebar__top">
        {switcher}
        {action}
      </div>
      <nav className="ds-sidebar__nav" aria-label="Main">
        {groups.map((g, i) => (
          <div key={i} className="ds-nav-group">
            {g.label ? (
              <div className="ds-nav-group__label">
                {g.icon}
                {g.label}
              </div>
            ) : null}
            {g.items.map((it) => (
              <NavRow key={it.to} item={it} active={activeTo === it.to} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      {footer ? <div className="ds-sidebar__bottom">{footer}</div> : null}
    </>
  );
}

function MobileSidebar({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { refs, context } = useFloating({ open, onOpenChange: (o) => !o && onClose() });
  const dismiss = useDismiss(context, { outsidePress: false });
  const { getFloatingProps } = useInteractions([dismiss]);
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <FloatingPortal root={(document.querySelector('[data-ds-portal]') as HTMLElement | null) ?? undefined}>
      <div className="ds-scrim" onClick={onClose} aria-hidden="true" />
      <FloatingFocusManager context={context} returnFocus>
        <div ref={refs.setFloating} className="ds-sidebar-drawer" role="dialog" aria-modal="true" aria-label="Navigation" {...getFloatingProps()}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 8px 0' }}>
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--icon" aria-label="Close navigation" onClick={onClose}>
              <IconX />
            </button>
          </div>
          {children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

export function Shell({
  className,
  switcher,
  action,
  groups,
  footer,
  sectionCrumb,
  topbarEnd,
  mobileBrand,
  menuAttrs,
  children,
}: {
  className?: string;
  /** Top-left product / workspace switcher. */
  switcher: ReactNode;
  /** Primary create action under the switcher. */
  action?: ReactNode;
  groups: NavGroup[];
  footer?: ReactNode;
  /** Leading crumbs for the current path (e.g. [{label:'Signal Loop'}, {label:'Review', to}]). */
  sectionCrumb: (pathname: string) => Crumb[];
  topbarEnd?: ReactNode;
  mobileBrand: ReactNode;
  /** Attributes for the mobile menu button (walkthrough anchor). */
  menuAttrs?: Record<string, string>;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const [extra, setExtra] = useState<Crumb[] | null>(null);
  const [drawer, setDrawer] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const setCrumbs = useCallback((c: Crumb[] | null) => setExtra(c), []);
  const ctx = useMemo(() => ({ setCrumbs }), [setCrumbs]);

  useEffect(() => setDrawer(false), [pathname]);

  const lead = sectionCrumb(pathname);
  const crumbs = [...lead, ...(extra ?? [])];

  const body = (onNavigate?: () => void) => <SidebarBody switcher={switcher} action={action} groups={groups} footer={footer} pathname={pathname} onNavigate={onNavigate} />;

  return (
    <ShellCtx.Provider value={ctx}>
      <div className={`ds-app ds-shell${className ? ` ${className}` : ''}`} data-ds-portal="">
        <a href="#main-content" className="ds-skip">
          Skip to content
        </a>
        <aside className="ds-sidebar" aria-label="Sidebar">
          {body()}
        </aside>
        <div className="ds-main">
          <header className="ds-topbar">
            <button type="button" className="ds-btn ds-btn--ghost ds-btn--icon ds-topbar__menu" aria-label="Open navigation" aria-expanded={drawer} onClick={() => setDrawer(true)} {...menuAttrs}>
              <IconMenu />
            </button>
            <span className="ds-topbar__brand">{mobileBrand}</span>
            <ol className="ds-crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li key={i}>
                    {c.to && !last ? <Link to={c.to}>{c.label}</Link> : <span aria-current={last ? 'page' : undefined}>{c.label}</span>}
                  </li>
                );
              })}
            </ol>
            <span className="ds-topbar__spacer" />
            {topbarEnd ? <div className="ds-topbar__end">{topbarEnd}</div> : null}
          </header>
          <main id="main-content" ref={mainRef} className="ds-content" tabIndex={-1}>
            {children}
          </main>
        </div>
        <MobileSidebar open={drawer} onClose={() => setDrawer(false)}>
          {body(() => setDrawer(false))}
        </MobileSidebar>
      </div>
    </ShellCtx.Provider>
  );
}
