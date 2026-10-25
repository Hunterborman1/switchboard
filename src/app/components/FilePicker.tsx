/**
 * The file picker: a calm, OS-style "Open" dialog over the synthetic call library
 * (GET /library). Folders come from LibraryFile.folder ("Calls/Week 43"). Mess levels are
 * never shown here — the choice should feel real; the New call page reveals them after.
 * The walkthrough's suggested file gets a quiet marker only while the tour is active.
 *
 * Keyboard: ↑/↓ move, Enter opens, Esc cancels, Tab is trapped in the dialog and focus
 * returns to the opener. Emits picker.opened / picker.closed / file.selected.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { LibraryFile } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { useLibrary, useLibraryFile } from '../api/hooks';
import { bytes } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { useTourState } from '../state';
import {
  FileGlyph,
  IconChevronRight,
  IconClock,
  IconFolder,
  IconFolderOpen,
  IconLibrary,
  IconSearch,
  IconSortAsc,
  IconSortDesc,
  IconSpark,
  IconX,
} from './icons';
import styles from './FilePicker.module.css';

type SortKey = 'name' | 'size' | 'modified';
const RECENT = '__recent__';
const KIND_LABEL: Record<string, string> = {
  vtt: 'WebVTT transcript',
  txt: 'Plain-text transcript',
  md: 'Markdown notes',
  eml: 'Email message',
  chat: 'Chat export',
};

type Tree = { root: string; children: { path: string; name: string; count: number }[]; count: number }[];

function buildTree(files: LibraryFile[]): Tree {
  const roots = new Map<string, Map<string, number>>();
  for (const f of files) {
    const [root = f.folder, ...rest] = f.folder.split('/');
    const sub = rest.join('/');
    const m = roots.get(root) ?? new Map<string, number>();
    m.set(sub, (m.get(sub) ?? 0) + 1);
    roots.set(root, m);
  }
  const order = ['Calls', 'Notes', 'Email', 'Exports'];
  return [...roots.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - ((order.indexOf(b[0]) + 99) % 99) || a[0].localeCompare(b[0]))
    .map(([root, subs]) => ({
      root,
      count: [...subs.values()].reduce((x, y) => x + y, 0),
      children: [...subs.entries()]
        .filter(([s]) => s)
        .sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }))
        .map(([s, count]) => ({ path: `${root}/${s}`, name: s, count })),
    }));
}

function fmtModified(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function FilePicker({
  open,
  onClose,
  onOpenFile,
  returnFocus,
}: {
  open: boolean;
  onClose: () => void;
  onOpenFile: (file: LibraryFile) => void;
  /** Called after a cancel so focus goes back to the opener. */
  returnFocus?: () => void;
}) {
  const { data: files, error, loading, refresh } = useLibrary();
  const { tourActive } = useTourState();
  const world = useWorldIndex();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const recommended = useMemo(() => files?.find((f) => f.recommended) ?? null, [files]);
  const tree = useMemo(() => buildTree(files ?? []), [files]);
  const defaultFolder = useMemo(() => {
    if (recommended) return recommended.folder;
    const newest = [...(files ?? [])].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))[0];
    return newest?.folder ?? RECENT;
  }, [files, recommended]);

  const [folder, setFolder] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'modified', dir: 'desc' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeFolder = folder ?? defaultFolder;

  // open / close lifecycle
  useEffect(() => {
    if (!open) return;
    emit({ name: 'picker.opened' });
    setQuery('');
    setFolder(null);
    setSelectedId(null);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => listRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const close = useCallback(
    (reason: 'cancel' | 'open') => {
      emit({ name: 'picker.closed' });
      onClose();
      if (reason === 'cancel') window.setTimeout(() => returnFocus?.(), 0);
    },
    [onClose, returnFocus],
  );

  const visible = useMemo(() => {
    const all = files ?? [];
    const q = query.trim().toLowerCase();
    let list = q
      ? all.filter((f) => `${f.filename} ${f.folder} ${world.accountName(f.accountId)} ${f.callType} ${f.callId} ${f.id}`.toLowerCase().includes(q))
      : activeFolder === RECENT
        ? [...all].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 10)
        : all.filter((f) => f.folder === activeFolder || f.folder.startsWith(`${activeFolder}/`));
    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sort.key === 'name') return a.filename.localeCompare(b.filename) * dir;
      if (sort.key === 'size') return (a.sizeBytes - b.sizeBytes) * dir;
      return a.modifiedAt.localeCompare(b.modifiedAt) * dir;
    });
    return list;
  }, [files, query, activeFolder, sort, world]);

  const selected = useMemo(() => visible.find((f) => f.id === selectedId) ?? (files ?? []).find((f) => f.id === selectedId) ?? null, [visible, files, selectedId]);

  const openFile = useCallback(
    (f: LibraryFile | null) => {
      if (!f) return;
      emit({ name: 'file.selected', fileId: f.id, tourPath: f.tourPath, format: f.format });
      onOpenFile(f);
      close('open');
    },
    [onOpenFile, close],
  );

  // Esc + focus trap
  const onDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close('cancel');
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]') ?? []).filter((n) => n.offsetParent !== null);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!visible.length) return;
    const idx = visible.findIndex((f) => f.id === selectedId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
      const f = visible[next]!;
      setSelectedId(f.id);
      listRef.current?.querySelector<HTMLElement>(`[data-file="${f.id}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && selected) {
      e.preventDefault();
      openFile(selected);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedId(visible[0]!.id);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedId(visible[visible.length - 1]!.id);
    }
  };

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

  if (!open) return null;

  const crumbs = query ? ['Library', `Search “${query}”`] : activeFolder === RECENT ? ['Library', 'Recent'] : ['Library', ...activeFolder.split('/')];
  const sortIcon = (k: SortKey) => (sort.key === k ? sort.dir === 'asc' ? <IconSortAsc size={14} /> : <IconSortDesc size={14} /> : null);

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && close('cancel')}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onDialogKey}
        {...tourAnchor('picker.dialog')}
      >
        {/* title bar */}
        <div className={styles.titlebar}>
          <span className={styles.titleIcon} aria-hidden="true">
            <IconFolderOpen size={16} />
          </span>
          <h2 id={titleId} className={styles.title}>
            Open a call file
          </h2>
          <button type="button" className={styles.close} onClick={() => close('cancel')} aria-label="Cancel and close">
            <IconX size={16} />
          </button>
        </div>

        {/* toolbar: breadcrumb + search */}
        <div className={styles.toolbar}>
          <nav className={styles.crumbs} aria-label="Location">
            <IconLibrary size={15} />
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className={styles.crumb}>
                {i > 0 ? <IconChevronRight size={12} /> : null}
                {i === 0 && (query || activeFolder !== RECENT) ? (
                  <button type="button" className={styles.crumbBtn} onClick={() => { setQuery(''); setFolder(RECENT); }}>
                    {c}
                  </button>
                ) : i > 0 && i < crumbs.length - 1 && !query ? (
                  <button type="button" className={styles.crumbBtn} onClick={() => setFolder(crumbs.slice(1, i + 1).join('/'))}>
                    {c}
                  </button>
                ) : (
                  <span className={i === crumbs.length - 1 ? styles.crumbCurrent : undefined}>{c}</span>
                )}
              </span>
            ))}
          </nav>
          <label className={styles.search}>
            <IconSearch size={15} />
            <span className="sl-sr-only">Search the library</span>
            <input
              ref={searchRef}
              type="search"
              placeholder="Search library"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  listRef.current?.focus();
                  if (!selectedId && visible[0]) setSelectedId(visible[0].id);
                }
              }}
            />
          </label>
        </div>

        <div className={styles.body}>
          {/* sidebar */}
          <nav className={styles.sidebar} aria-label="Folders" {...tourAnchor('picker.folder')}>
            <div className={styles.sideLabel}>Signal Loop library</div>
            <button
              type="button"
              className={`${styles.folder} ${activeFolder === RECENT && !query ? styles.folderActive : ''}`}
              onClick={() => { setQuery(''); setFolder(RECENT); }}
              aria-current={activeFolder === RECENT && !query ? 'true' : undefined}
            >
              <IconClock size={15} />
              <span className={styles.folderName}>Recent</span>
            </button>
            {tree.map((root) => (
              <div key={root.root} className={styles.folderGroup}>
                <button
                  type="button"
                  className={`${styles.folder} ${activeFolder === root.root && !query ? styles.folderActive : ''}`}
                  onClick={() => { setQuery(''); setFolder(root.root); }}
                  aria-current={activeFolder === root.root && !query ? 'true' : undefined}
                >
                  {activeFolder.startsWith(root.root) && !query ? <IconFolderOpen size={15} /> : <IconFolder size={15} />}
                  <span className={styles.folderName}>{root.root}</span>
                  <span className={styles.folderCount}>{root.count}</span>
                </button>
                {root.children.map((c) => (
                  <button
                    key={c.path}
                    type="button"
                    className={`${styles.folder} ${styles.folderChild} ${activeFolder === c.path && !query ? styles.folderActive : ''}`}
                    onClick={() => { setQuery(''); setFolder(c.path); }}
                    aria-current={activeFolder === c.path && !query ? 'true' : undefined}
                  >
                    {activeFolder === c.path && !query ? <IconFolderOpen size={15} /> : <IconFolder size={15} />}
                    <span className={styles.folderName}>{c.name}</span>
                    <span className={styles.folderCount}>{c.count}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* list */}
          <div className={styles.listPane}>
            <div className={styles.listHead} role="presentation">
              <button type="button" className={styles.colName} onClick={() => toggleSort('name')} aria-label={`Sort by name${sort.key === 'name' ? ` (${sort.dir}ending)` : ''}`}>
                Name {sortIcon('name')}
              </button>
              <button type="button" className={styles.colSize} onClick={() => toggleSort('size')} aria-label={`Sort by size${sort.key === 'size' ? ` (${sort.dir}ending)` : ''}`}>
                Size {sortIcon('size')}
              </button>
              <button type="button" className={styles.colDate} onClick={() => toggleSort('modified')} aria-label={`Sort by date modified${sort.key === 'modified' ? ` (${sort.dir}ending)` : ''}`}>
                Modified {sortIcon('modified')}
              </button>
            </div>
            <div
              ref={listRef}
              className={styles.list}
              role="listbox"
              aria-label={`Files in ${crumbs[crumbs.length - 1]}`}
              aria-activedescendant={selectedId ? `pick-${selectedId}` : undefined}
              tabIndex={0}
              onKeyDown={onListKey}
            >
              {loading ? (
                Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className={styles.skelRow} aria-hidden="true">
                    <span className={styles.skelIcon} />
                    <span className={styles.skelBar} style={{ width: `${60 - i * 4}%` }} />
                  </div>
                ))
              ) : error ? (
                <div className={styles.listEmpty} role="alert">
                  <strong>Could not read the library.</strong>
                  <span>{error.message}</span>
                  <button type="button" className="sl-linkbtn" onClick={() => void refresh()}>
                    Retry
                  </button>
                </div>
              ) : visible.length === 0 ? (
                <div className={styles.listEmpty} role="status">
                  <strong>{query ? 'No files match' : 'This folder is empty'}</strong>
                  <span>{query ? 'Try an account name, a call type or a date like 2026-10-21.' : 'Pick another folder on the left.'}</span>
                </div>
              ) : (
                visible.map((f) => {
                  const isSel = f.id === selectedId;
                  const suggested = tourActive && f.recommended;
                  return (
                    <div
                      key={f.id}
                      id={`pick-${f.id}`}
                      data-file={f.id}
                      role="option"
                      aria-selected={isSel}
                      className={`${styles.row} ${isSel ? styles.rowSelected : ''} ${suggested ? styles.rowSuggested : ''}`}
                      onClick={() => setSelectedId(f.id)}
                      onDoubleClick={() => openFile(f)}
                      {...(f.recommended ? tourAnchor('picker.recommended') : {})}
                    >
                      <span className={styles.cellName}>
                        <FileGlyph format={f.format} size={26} />
                        <span className={styles.nameText}>
                          <span className={styles.fileName}>{f.filename}</span>
                          <span className={styles.fileMeta}>
                            {query ? `${f.folder} · ` : ''}
                            {KIND_LABEL[f.format] ?? f.format}
                            {f.edgeKind === 'duplicate' ? <b className={styles.dupTag}> · Re-upload (same call)</b> : null}
                            <span className={styles.metaMobile}> · {bytes(f.sizeBytes)} · {fmtModified(f.modifiedAt)}</span>
                          </span>
                          {suggested ? (
                            <span className={styles.suggest}>
                              <IconSpark size={12} /> Suggested for the walkthrough
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className={styles.cellSize}>{bytes(f.sizeBytes)}</span>
                      <span className={styles.cellDate}>{fmtModified(f.modifiedAt)}</span>
                    </div>
                  );
                })
              )}
            </div>
            <div className={styles.statusbar} aria-live="polite">
              {loading ? 'Reading library…' : `${visible.length} item${visible.length === 1 ? '' : 's'}${selected ? ' · 1 selected' : ''}`}
            </div>
          </div>

          {/* preview */}
          <Preview file={selected} accountName={selected ? world.accountName(selected.accountId) : ''} />
        </div>

        {/* footer */}
        <div className={styles.footer}>
          <label className={styles.fileField}>
            <span className={styles.fileFieldLabel}>File name</span>
            <input readOnly value={selected?.filename ?? ''} placeholder="Select a file" aria-label="Selected file name" tabIndex={-1} />
          </label>
          <span className={styles.typeFilter} aria-hidden="true">
            Call files (.vtt .txt .md .eml .chat)
          </span>
          <div className={styles.footerBtns}>
            <button type="button" className={styles.btnSecondary} onClick={() => close('cancel')}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!selected}
              title={selected ? `Open ${selected.filename}` : 'Select a file first'}
              aria-describedby={!selected ? `${titleId}-why` : undefined}
              onClick={() => openFile(selected)}
              {...tourAnchor('picker.open')}
            >
              Open
            </button>
            {!selected ? (
              <span id={`${titleId}-why`} className="sl-sr-only">
                Disabled until a file is selected
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function Preview({ file, accountName }: { file: LibraryFile | null; accountName: string }) {
  const { data, loading, error } = useLibraryFile(file?.id ?? null);
  const lines = useMemo(() => (data?.content ?? '').replace(/\r\n/g, '\n').split('\n').slice(0, 40), [data]);
  return (
    <aside className={styles.preview} aria-label="Preview" {...tourAnchor('picker.preview')}>
      {!file ? (
        <div className={styles.previewEmpty}>
          <IconEyeOff />
          <span>Select a file to preview its first lines.</span>
        </div>
      ) : (
        <>
          <div className={styles.previewHead}>
            <FileGlyph format={file.format} size={34} />
            <div style={{ minWidth: 0 }}>
              <div className={styles.previewName} title={file.filename}>
                {file.filename}
              </div>
              <div className={styles.previewMeta}>
                {KIND_LABEL[file.format] ?? file.format} · {bytes(file.sizeBytes)}
                {file.edgeKind === 'duplicate' ? ' · re-upload of the same call (a duplicate-detection test)' : ''}
              </div>
            </div>
          </div>
          <dl className={styles.previewFacts}>
            <dt>Account</dt>
            <dd>{file.accountId ? accountName : 'Not linked'}</dd>
            <dt>Call</dt>
            <dd>
              <span className="sl-mono">{file.callId}</span> · {file.callType}
            </dd>
            <dt>Modified</dt>
            <dd>{fmtModified(file.modifiedAt)}</dd>
          </dl>
          <div className={styles.previewLabel}>First lines</div>
          <div className={styles.previewText} aria-busy={loading || undefined}>
            {loading ? (
              <div className={styles.previewSkel} aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <span key={i} style={{ width: `${92 - ((i * 17) % 40)}%` }} />
                ))}
              </div>
            ) : error ? (
              <span className={styles.previewErr}>Preview unavailable: {error.message}</span>
            ) : (
              <pre>
                {lines.map((l, i) => (
                  <span key={i} className={styles.previewLine}>
                    <span className={styles.lineNo} aria-hidden="true">
                      {i + 1}
                    </span>
                    {l || ' '}
                  </span>
                ))}
              </pre>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function IconEyeOff() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
      <path d="M7 3.5h7.5L19 8v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M14.5 3.5V8H19M9 12.5h6M9 15.5h6M9 18.5h3.5" />
    </svg>
  );
}
