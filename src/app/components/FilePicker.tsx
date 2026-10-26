/**
 * The library picker: conversations from the workspace's connected tools (GET /library: a
 * simulated library of sample files with fictional accounts; the header says Simulated), in a
 * two-pane dialog (folders, then files with a preview of the selected one). Folders come from
 * LibraryFile.folder ("Calls/Week 43"); each file shows the tool it came from. Mess levels are
 * never shown here, so the choice feels real; the New conversation page reveals them after.
 * The walkthrough's suggested file gets a quiet marker only while the tour is active.
 *
 * Built on the design system's dialog (same scrim, panel, header and footer as Modal) with its
 * own body. Keyboard: ↑/↓ move, Home/End jump, Enter opens, Esc cancels, Tab stays inside.
 * Emits picker.opened / picker.closed / file.selected.
 */
import { FloatingFocusManager, FloatingPortal, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { LibraryFile } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { Badge, Button, ConnectorMark, cx, EmptyState, IconButton, KeyValue, SearchInput, Select, Skeleton, Tooltip } from '../../ds';
import { IconAlertCircle, IconChevronRight, IconClock, IconFileText, IconFolder, IconRefresh, IconSearch, IconSparkle, IconX } from '../../ds/icons';
import { useLibrary, useLibraryFile } from '../api/hooks';
import { bytes, dateShort, dateTime } from '../lib/labels';
import { previewLines } from '../lib/preview';
import { librarySource } from '../lib/source';
import { useWorldIndex } from '../lib/world';
import { useTourState } from '../state';
import { SIMULATED_TIP, SimulatedBadge, sourceLabel } from './domain';
import styles from './FilePicker.module.css';

type SortKey = 'newest' | 'oldest' | 'name' | 'name_desc' | 'largest';
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name, A to Z' },
  { value: 'name_desc', label: 'Name, Z to A' },
  { value: 'largest', label: 'Largest first' },
];
const RECENT = '__recent__';
const ROOT_ORDER = ['Calls', 'Notes', 'Email', 'Slack exports', 'Exports'];

/** What the file is, in a word or two. */
export function libraryKind(f: Pick<LibraryFile, 'format' | 'folder'>): string {
  switch (f.format) {
    case 'vtt':
    case 'srt':
      return 'Transcript';
    case 'md':
      return 'Notes';
    case 'eml':
      return 'Email';
    case 'chat':
      return 'Chat export';
    case 'doc':
      return 'Document';
    default:
      return f.folder.startsWith('Notes') ? 'Notes' : 'Transcript';
  }
}

/** "Transcript from Gong", "Email from Gmail", "Uploaded transcript". */
export function libraryOrigin(f: Pick<LibraryFile, 'format' | 'folder' | 'filename'>): string {
  const kind = libraryKind(f);
  const src = librarySource(f);
  return src === 'upload' ? `Uploaded ${kind.toLowerCase()}` : `${kind} from ${sourceLabel(src)}`;
}

type Tree = { root: string; count: number; children: { path: string; name: string; count: number }[] }[];

function buildTree(files: LibraryFile[]): Tree {
  const roots = new Map<string, Map<string, number>>();
  for (const f of files) {
    const [root = f.folder, ...rest] = f.folder.split('/');
    const sub = rest.join('/');
    const m = roots.get(root) ?? new Map<string, number>();
    m.set(sub, (m.get(sub) ?? 0) + 1);
    roots.set(root, m);
  }
  const rank = (r: string) => (ROOT_ORDER.includes(r) ? ROOT_ORDER.indexOf(r) : 99);
  return [...roots.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([root, subs]) => ({
      root,
      count: [...subs.values()].reduce((x, y) => x + y, 0),
      children: [...subs.entries()]
        .filter(([s]) => s)
        .sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }))
        .map(([s, count]) => ({ path: `${root}/${s}`, name: s, count })),
    }));
}

function portalRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return (document.querySelector('[data-ds-portal]') as HTMLElement | null) ?? document.body;
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
  const descId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const recommended = useMemo(() => files?.find((f) => f.recommended) ?? null, [files]);
  const tree = useMemo(() => buildTree(files ?? []), [files]);
  const defaultFolder = useMemo(() => {
    if (recommended) return recommended.folder;
    const newest = [...(files ?? [])].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))[0];
    return newest?.folder ?? RECENT;
  }, [files, recommended]);

  const [folder, setFolder] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeFolder = folder ?? defaultFolder;

  const close = useCallback(
    (reason: 'cancel' | 'open') => {
      emit({ name: 'picker.closed' });
      onClose();
      if (reason === 'cancel') window.setTimeout(() => returnFocus?.(), 0);
    },
    [onClose, returnFocus],
  );

  const { refs, context } = useFloating({ open, onOpenChange: (o) => !o && close('cancel') });
  const dismiss = useDismiss(context, { outsidePress: false, escapeKey: true });
  const role = useRole(context, { role: 'dialog' });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  // open: announce, reset, lock the page behind
  useEffect(() => {
    if (!open) return;
    emit({ name: 'picker.opened' });
    setQuery('');
    setFolder(null);
    setSelectedId(null);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  const visible = useMemo(() => {
    const all = files ?? [];
    const q = query.trim().toLowerCase();
    const list = q
      ? all.filter((f) => `${f.filename} ${f.folder} ${world.accountName(f.accountId)} ${f.callType} ${f.callId} ${f.id} ${libraryOrigin(f)}`.toLowerCase().includes(q))
      : activeFolder === RECENT
        ? [...all].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 12)
        : all.filter((f) => f.folder === activeFolder || f.folder.startsWith(`${activeFolder}/`));
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.modifiedAt.localeCompare(b.modifiedAt);
        case 'name':
          return a.filename.localeCompare(b.filename);
        case 'name_desc':
          return b.filename.localeCompare(a.filename);
        case 'largest':
          return b.sizeBytes - a.sizeBytes;
        default:
          return b.modifiedAt.localeCompare(a.modifiedAt);
      }
    });
  }, [files, query, activeFolder, sort, world]);

  const selected = useMemo(() => (files ?? []).find((f) => f.id === selectedId) ?? null, [files, selectedId]);

  const openFile = useCallback(
    (f: LibraryFile | null) => {
      if (!f) return;
      emit({ name: 'file.selected', fileId: f.id, tourPath: f.tourPath, format: f.format });
      onOpenFile(f);
      close('open');
    },
    [onOpenFile, close],
  );

  const select = (f: LibraryFile) => {
    setSelectedId(f.id);
    listRef.current?.querySelector<HTMLElement>(`[data-file="${f.id}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!visible.length) return;
    const idx = visible.findIndex((f) => f.id === selectedId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1);
      select(visible[next]!);
    } else if (e.key === 'Home') {
      e.preventDefault();
      select(visible[0]!);
    } else if (e.key === 'End') {
      e.preventDefault();
      select(visible[visible.length - 1]!);
    } else if (e.key === 'Enter' && selected) {
      e.preventDefault();
      openFile(selected);
    }
  };

  const goFolder = (path: string) => {
    setQuery('');
    setFolder(path);
  };

  if (!open) return null;

  const isActive = (path: string) => !query && activeFolder === path;
  const location = query ? [`Results for “${query.trim()}”`] : activeFolder === RECENT ? ['Recent'] : activeFolder.split('/');

  return (
    <FloatingPortal root={portalRoot()}>
      <div className="ds-scrim" onClick={() => close('cancel')} aria-hidden="true" />
      <FloatingFocusManager context={context} initialFocus={listRef} returnFocus={false}>
        <div
          ref={refs.setFloating}
          className={cx('ds-dialog', styles.dialog)}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          {...tourAnchor('picker.dialog')}
          {...getFloatingProps()}
        >
          <div className="ds-dialog__header">
            <div className={styles.heading}>
              <div className={styles.titleRow}>
                <h2 id={titleId} className="ds-dialog__title">
                  Choose a conversation
                </h2>
                <SimulatedBadge tip={SIMULATED_TIP.sources} />
              </div>
              <p id={descId} className="ds-dialog__description">
                Sample calls, notes, email threads and chat exports, standing in for your connected tools.
              </p>
            </div>
            <IconButton className="ds-dialog__close" size="sm" label="Close" icon={<IconX />} tooltip={false} onClick={() => close('cancel')} />
          </div>

          <div className={styles.searchRow}>
            <SearchInput
              width="100%"
              placeholder="Search by name, account or call ID"
              aria-label="Search conversations"
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
          </div>

          <div className={styles.body}>
            <nav className={styles.folders} aria-label="Folders" {...tourAnchor('picker.folder')}>
              <button type="button" className={styles.folder} aria-current={isActive(RECENT) ? 'true' : undefined} onClick={() => goFolder(RECENT)}>
                <IconClock size={16} />
                <span className={styles.folderName}>Recent</span>
              </button>
              {tree.map((root) => (
                <div key={root.root} className={styles.folderGroup}>
                  <button type="button" className={styles.folder} aria-current={isActive(root.root) ? 'true' : undefined} onClick={() => goFolder(root.root)}>
                    <IconFolder size={16} />
                    <span className={styles.folderName}>{root.root}</span>
                    <span className={styles.folderCount}>{root.count}</span>
                  </button>
                  {root.children.map((c) => (
                    <button
                      key={c.path}
                      type="button"
                      className={cx(styles.folder, styles.folderChild)}
                      aria-current={isActive(c.path) ? 'true' : undefined}
                      onClick={() => goFolder(c.path)}
                    >
                      <span className={styles.folderName}>{c.name}</span>
                      <span className={styles.folderCount}>{c.count}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>

            <div className={styles.listPane}>
              <div className={styles.listHead}>
                <nav className={styles.location} aria-label="Location">
                  {location.map((c, i) => (
                    <span key={`${c}-${i}`} className={styles.crumb}>
                      {i > 0 ? <IconChevronRight size={14} className={styles.crumbSep} /> : null}
                      {i < location.length - 1 ? (
                        <button type="button" className={styles.crumbButton} onClick={() => goFolder(location.slice(0, i + 1).join('/'))}>
                          {c}
                        </button>
                      ) : (
                        <span className={styles.crumbCurrent}>{c}</span>
                      )}
                    </span>
                  ))}
                </nav>
                <Select selectSize="sm" aria-label="Sort" className={styles.sort} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} options={SORTS} />
              </div>
              <div
                ref={listRef}
                className={styles.list}
                role="listbox"
                aria-label={query ? 'Search results' : `Conversations in ${location[location.length - 1]}`}
                aria-activedescendant={selectedId && visible.some((f) => f.id === selectedId) ? `pick-${selectedId}` : undefined}
                aria-busy={loading || undefined}
                tabIndex={0}
                onKeyDown={onListKey}
              >
                {loading ? (
                  Array.from({ length: 7 }, (_, i) => (
                    <div key={i} className={styles.skelRow} aria-hidden="true">
                      <Skeleton width={24} height={24} radius={6} />
                      <span className={styles.skelText}>
                        <Skeleton width={`${72 - i * 5}%`} height={10} />
                        <Skeleton width="38%" height={8} />
                      </span>
                    </div>
                  ))
                ) : error ? (
                  <EmptyState
                    compact
                    icon={<IconAlertCircle />}
                    title="Couldn’t load the library"
                    description={error.message}
                    actions={
                      <Button size="sm" icon={<IconRefresh size={14} />} onClick={() => void refresh()}>
                        Try again
                      </Button>
                    }
                  />
                ) : visible.length === 0 ? (
                  <EmptyState
                    compact
                    icon={query ? <IconSearch /> : <IconFolder />}
                    title={query ? 'No conversations match' : 'This folder is empty'}
                    description={query ? 'Try an account name, a call type or a call ID like C-1042.' : 'Choose another folder.'}
                  />
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
                        className={styles.row}
                        onClick={() => setSelectedId(f.id)}
                        onDoubleClick={() => openFile(f)}
                        {...(f.recommended ? tourAnchor('picker.recommended') : {})}
                      >
                        <ConnectorMark id={librarySource(f)} size={24} />
                        <span className={styles.rowText}>
                          <span className={styles.rowName} title={f.filename}>
                            {f.filename}
                          </span>
                          <span className={styles.rowMeta}>
                            <span className={styles.rowOrigin}>{libraryOrigin(f)}</span>
                            {f.edgeKind === 'duplicate' ? <Badge>Re-upload</Badge> : null}
                            {suggested ? (
                              <Badge tone="accent">
                                <IconSparkle size={12} />
                                Suggested for the walkthrough
                              </Badge>
                            ) : null}
                          </span>
                        </span>
                        <span className={styles.rowDate}>{dateShort(f.modifiedAt)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <Preview file={selected} accountName={selected?.accountId ? world.accountName(selected.accountId) : null} />
          </div>

          <div className="ds-dialog__footer">
            <span className="ds-dialog__footer-start" aria-live="polite">
              {loading ? 'Loading the library' : `${visible.length} conversation${visible.length === 1 ? '' : 's'}`}
            </span>
            <Button variant="ghost" onClick={() => close('cancel')}>
              Cancel
            </Button>
            <Tooltip label="Select a conversation first" disabled={!!selected}>
              <span className={styles.openWrap} tabIndex={selected ? undefined : 0}>
                <Button variant="primary" disabled={!selected} aria-describedby={selected ? undefined : `${titleId}-why`} onClick={() => openFile(selected)} {...tourAnchor('picker.open')}>
                  Open
                </Button>
              </span>
            </Tooltip>
            {!selected ? (
              <span id={`${titleId}-why`} className="ds-sr-only">
                Disabled until a conversation is selected
              </span>
            ) : null}
          </div>
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

function Preview({ file, accountName }: { file: LibraryFile | null; accountName: string | null }) {
  const { data, loading, error } = useLibraryFile(file?.id ?? null);
  const text = useMemo(() => previewLines(data?.content ?? '', 30, 4000), [data]);
  return (
    <aside className={styles.preview} aria-label="Preview" {...tourAnchor('picker.preview')}>
      {!file ? (
        <div className={styles.previewEmpty}>
          <span className={styles.previewEmptyIcon}>
            <IconFileText size={20} />
          </span>
          <span>Select a conversation to preview it</span>
        </div>
      ) : (
        <>
          <div className={styles.previewHead}>
            <ConnectorMark id={librarySource(file)} size={32} />
            <div className={styles.previewTitle}>
              <span className={styles.previewName} title={file.filename}>{file.filename}</span>
              <span className={styles.previewOrigin}>{libraryOrigin(file)}</span>
            </div>
          </div>
          <KeyValue
            className={styles.previewFacts}
            items={[
              { label: 'Account', value: accountName ?? <span className="ds-subtle">Not linked</span> },
              { label: 'Call', value: <span className={styles.callRef}><span className="ds-mono">{file.callId}</span><span>{file.callType}</span></span> },
              { label: 'Size', value: bytes(file.sizeBytes) },
              { label: 'Modified', value: dateTime(file.modifiedAt) },
              ...(file.edgeKind === 'duplicate' ? [{ label: 'Note', value: 'Re-upload of the same call' }] : []),
            ]}
          />
          <div className={styles.previewLabel}>First lines</div>
          <div className={styles.previewText} aria-busy={loading || undefined}>
            {loading ? (
              <div className={styles.previewSkel} aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} width={`${92 - ((i * 17) % 40)}%`} height={8} />
                ))}
              </div>
            ) : error ? (
              <span className={styles.previewError}>Preview unavailable: {error.message}</span>
            ) : (
              <p className={styles.previewBody}>{text}</p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
