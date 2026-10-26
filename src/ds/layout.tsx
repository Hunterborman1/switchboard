/**
 * Page structure: page frame, page header, sections, cards, toolbars.
 * Every product page is Page → PageHeader → (Toolbar) → Cards / Sections.
 */
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cx } from './primitives';

export function Page({ children, width = 'default', className, attrs }: { children: ReactNode; width?: 'default' | 'wide' | 'narrow'; className?: string; attrs?: Record<string, string> }) {
  return (
    <div className={cx('ds-page', width !== 'default' && `ds-page--${width}`, className)} {...attrs}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
  badge,
  attrs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A row of small facts under the description (owner, updated, counts). */
  meta?: ReactNode;
  /** Status next to the title. */
  badge?: ReactNode;
  attrs?: Record<string, string>;
}) {
  return (
    <header className="ds-page-header" {...attrs}>
      <div className="ds-page-header__text">
        <h1 className="ds-page-header__title">
          <span className="ds-truncate">{title}</span>
          {badge}
        </h1>
        {description ? <p className="ds-page-header__description">{description}</p> : null}
        {meta ? <div className="ds-page-header__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="ds-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, description, actions, children, className, attrs }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; attrs?: Record<string, string> }) {
  return (
    <section className={cx('ds-section', className)} {...attrs}>
      {title || actions ? (
        <div className="ds-section__head">
          <div className="ds-stack" style={{ gap: 2 }}>
            {title ? <h2 className="ds-section__title">{title}</h2> : null}
            {description ? <p className="ds-section__description">{description}</p> : null}
          </div>
          {actions ? <div className="ds-toolbar__group">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Card({
  title,
  description,
  actions,
  footer,
  children,
  flush,
  plainHeader,
  interactive,
  className,
  bodyClassName,
  attrs,
  as: Tag = 'section',
  id,
  style,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** Body without padding (tables, lists). */
  flush?: boolean;
  /** Header without the divider line (the body continues the header). */
  plainHeader?: boolean;
  interactive?: boolean;
  className?: string;
  bodyClassName?: string;
  attrs?: Record<string, string>;
  as?: ElementType;
  id?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag className={cx('ds-card', flush && 'ds-card--flush', interactive && 'ds-card--interactive', className)} id={id} style={style} {...attrs}>
      {title || actions ? (
        <div className={cx('ds-card__header', plainHeader && 'ds-card__header--plain')}>
          <div className="ds-card__heading">
            {title ? <h2 className="ds-card__title">{title}</h2> : null}
            {description ? <p className="ds-card__description">{description}</p> : null}
          </div>
          {actions ? <div className="ds-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children !== undefined && children !== null ? <div className={cx('ds-card__body', bodyClassName)}>{children}</div> : null}
      {footer ? <div className="ds-card__footer">{footer}</div> : null}
    </Tag>
  );
}

export function Toolbar({ start, end, className }: { start?: ReactNode; end?: ReactNode; className?: string }) {
  return (
    <div className={cx('ds-toolbar', className)}>
      <div className="ds-toolbar__group">{start}</div>
      {end ? <div className="ds-toolbar__group">{end}</div> : null}
    </div>
  );
}

export function Grid({ cols, children, className, style }: { cols: 2 | 3 | 4 | 'sidebar'; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx('ds-grid', `ds-grid--${cols}`, className)} style={style}>
      {children}
    </div>
  );
}

export function Divider() {
  return <hr className="ds-divider" />;
}
