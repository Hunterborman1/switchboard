/**
 * Form controls: field wrapper, input, search, textarea, select, switch, checkbox, segmented
 * control and tabs. Native elements underneath, so keyboard and screen readers work as-is.
 */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { NavLink } from 'react-router-dom';
import { IconSearch } from './icons';
import { cx } from './primitives';

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cx('ds-field', className)}>
      <label className="ds-field__label" htmlFor={htmlFor}>
        {label}
        {optional ? <span className="ds-field__optional"> (optional)</span> : null}
      </label>
      {children}
      {error ? <span className="ds-field__error">{error}</span> : hint ? <span className="ds-field__hint">{hint}</span> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { inputSize?: 'sm' | 'md' }>(function Input({ className, inputSize = 'md', ...rest }, ref) {
  return <input ref={ref} className={cx('ds-input', inputSize === 'sm' && 'ds-input--sm', className)} {...rest} />;
});

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { inputSize?: 'sm' | 'md'; width?: number | string }>(function SearchInput(
  { className, inputSize = 'md', width, style, ...rest },
  ref,
) {
  return (
    <span className="ds-input-wrap" style={{ width: width ?? 240, maxWidth: '100%', ...style }}>
      <IconSearch size={15} />
      <input ref={ref} type="search" className={cx('ds-input', inputSize === 'sm' && 'ds-input--sm', className)} {...rest} />
    </span>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('ds-textarea', className)} {...rest} />;
});

export type Option = { value: string; label: string; disabled?: boolean };

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { options: (Option | { group: string; options: Option[] })[]; selectSize?: 'sm' | 'md'; placeholder?: string }>(
  function Select({ options, className, selectSize = 'md', placeholder, ...rest }, ref) {
    return (
      <select ref={ref} className={cx('ds-select', selectSize === 'sm' && 'ds-select--sm', className)} {...rest}>
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) =>
          'group' in o ? (
            <optgroup key={o.group} label={o.group}>
              {o.options.map((x) => (
                <option key={x.value} value={x.value} disabled={x.disabled}>
                  {x.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ),
        )}
      </select>
    );
  },
);

export function Switch({ checked, onChange, label, disabled, id, attrs }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string; attrs?: Record<string, string> }) {
  return (
    <button type="button" role="switch" id={id} aria-checked={checked} aria-label={label} disabled={disabled} className="ds-switch" onClick={() => onChange(!checked)} {...attrs} />
  );
}

export function Checkbox({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="ds-check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export type SegmentOption<T extends string> = { value: T; label: ReactNode; count?: number | null; attrs?: Record<string, string> };

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('ds-segmented', size === 'sm' && 'ds-segmented--sm')} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="ds-segmented__item" aria-pressed={value === o.value} onClick={() => onChange(o.value)} {...o.attrs}>
          {o.label}
          {o.count != null ? <span className="ds-segmented__count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export type TabItem<T extends string> = { value: T; label: ReactNode; count?: number | null; attrs?: Record<string, string> };

/** In-page tabs (state). For tabs that are routes, use TabLinks. */
export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; label: string }) {
  return (
    <div className="ds-tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" className="ds-tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} {...t.attrs}>
          {t.label}
          {t.count != null ? <span className="ds-tab__count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function TabLinks({ items, label }: { items: { to: string; label: ReactNode; end?: boolean; count?: number | null }[]; label: string }) {
  return (
    <nav className="ds-tabs" aria-label={label}>
      {items.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx('ds-tab', isActive && 'is-active')}>
          {t.label}
          {t.count != null ? <span className="ds-tab__count">{t.count}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}
