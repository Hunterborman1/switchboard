/**
 * New conversation: bring something into Switchboard one of three ways (a connected source,
 * through the library picker; a file of any common type, converted to text in the browser; or
 * pasted text), then process it. After a library pick the page reveals the file's complexity
 * (mess level 1–5) or edge case, never before, so the choice feels real. "Process conversation"
 * creates the run and opens it. The chosen way in lives in the URL (?via=upload|paste).
 */
import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CreateRun, EdgeKind, LibraryFile, MessLevel } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { Badge, Button, Callout, Card, ConnectorMark, cx, IconButton, Input, KeyValue, Page, PageHeader, Skeleton, Spinner, Tabs, Textarea, Tooltip, useToast } from '../../ds';
import { IconArrowRight, IconFolder, IconInfo, IconUpload, IconX } from '../../ds/icons';
import { api, ApiError } from '../api/client';
import { invalidate, keys, setCached, useLibrary, useLibraryFile, useSession } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { FilePicker } from '../components/FilePicker';
import { SIMULATED_TIP, SimulatedBadge, sourceLabel, When } from '../components/domain';
import { ACCEPT, convertFile, ConvertError, extOf, MAX_TEXT_CHARS, MIN_TEXT_CHARS, pagesLabel, type ConvertResult } from '../lib/convert';
import { bytes, dateShort } from '../lib/labels';
import { previewLines } from '../lib/preview';
import { librarySource } from '../lib/source';
import { useWorldIndex } from '../lib/world';
import { useTourState } from '../state';
import { track } from '../telemetry';
import styles from './NewCall.module.css';

type Via = 'library' | 'upload' | 'paste';
const VIAS: Via[] = ['library', 'upload', 'paste'];

type Upload =
  | { status: 'reading'; name: string; size: number }
  | { status: 'ready'; name: string; size: number; result: ConvertResult }
  | { status: 'error'; name: string; size: number; title: string; message: string };

const LEVEL: Record<MessLevel, { name: string; line: string }> = {
  1: { name: 'Clean notes', line: 'Structured CSM notes. Nothing to untangle.' },
  2: { name: 'Tidy transcript', line: 'Speaker labels and timestamps, with several insights in one call.' },
  3: { name: 'Real conversation', line: 'Filler, tangents and small talk. Insights span several turns.' },
  4: { name: 'Messy speech-to-text', line: 'Misheard words (“in vocal”), swapped speakers, crosstalk and hedged complaints.' },
  5: { name: 'Chaos', line: 'Slack shorthand, forwarded threads and partial transcripts. Context has to be inferred.' },
};

const EDGE: Record<EdgeKind, { name: string; line: string }> = {
  nothing_actionable: { name: 'Nothing actionable', line: 'A friendly check-in. The right answer is no insights, and Switchboard should say so.' },
  injection: { name: 'Attempt to manipulate the AI', line: 'Contains instructions aimed at an AI. Watch them get treated as plain text, not commands.' },
  phi_heavy: { name: 'Full of patient details', line: 'Personal and health details are replaced with placeholders before any AI sees the text.' },
  non_english: { name: 'Not in English', line: 'The language is detected, and every quote is still checked against the conversation.' },
  duplicate: { name: 'Duplicate upload', line: 'An exact copy of an earlier file. Switchboard recognises it and doesn’t process it twice.' },
};

const STEPS: { title: string; line: string }[] = [
  { title: 'Works out what it is', line: 'Call, notes, email, chat or document' },
  { title: 'Removes personal details', line: 'Before any AI model sees the text' },
  { title: 'Runs Signal Loop', line: 'Finds feedback, bugs and churn risk' },
  { title: 'Checks every quote', line: 'Drops anything not in the source' },
  { title: 'Routes to the owners', line: 'Slack, Jira, Linear, email or review' },
];

const SOURCE_MARKS = ['gong', 'zoom', 'gmail', 'slack', 'google_drive'];
const fmt = (n: number) => n.toLocaleString('en-US');

/** Keep the extension when a long name has to be cut to the contract's 160 characters. */
function runFilename(name: string): string {
  if (name.length <= 160) return name;
  const ext = extOf(name);
  return ext ? `${name.slice(0, 159 - ext.length)}.${ext}` : name.slice(0, 160);
}

export default function NewCallPage() {
  useDocumentTitle('New conversation');
  const navigate = useNavigate();
  const toast = useToast();
  const world = useWorldIndex();
  const session = useSession();
  const library = useLibrary();
  const { tourActive } = useTourState();
  const live = session.data?.budget.liveEnabled ?? true;
  const pausedByOwner = session.data?.budget.reason === 'disabled_by_owner';

  const [params, setParams] = useSearchParams();
  const rawVia = params.get('via') as Via | null;
  const via: Via = rawVia && VIAS.includes(rawVia) ? rawVia : 'library';

  const [pickerOpen, setPickerOpen] = useState(false);
  const [file, setFile] = useState<LibraryFile | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  /** This workspace already ran the chosen file: offer the earlier run or a fresh live run. */
  const [earlier, setEarlier] = useState<{ runId: string; createdAt: string | null; mode: 'live' | 'replay' } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const readSeq = useRef(0);
  const statusId = useId();

  const textLen = text.trim().length;

  const setVia = (v: Via) => {
    const next = new URLSearchParams(params);
    if (v === 'library') next.delete('via');
    else next.set('via', v);
    setParams(next, { replace: true });
    setEarlier(null);
    setRunError(null);
  };

  const focusRun = () => window.setTimeout(() => document.querySelector<HTMLElement>('[data-tour="new.run"]')?.focus(), 60);

  const openEarlier = useCallback(
    (runId: string, mode: 'live' | 'replay') => {
      emit({ name: 'run.started', runId, fileId: via === 'library' ? (file?.id ?? null) : null, mode, reused: true });
      navigate(`/app/runs/${runId}?earlier=1`);
    },
    [via, file, navigate],
  );

  /**
   * `rerun` asks for a genuinely new run even though this workspace already ran the same file
   * (still budget- and rate-limited). The walkthrough always reruns, so a restarted tour runs live
   * again instead of silently reopening the rehearsal.
   */
  const startRun = useCallback(
    async (rerun = false) => {
      setRunError(null);
      setEarlier(null);
      setRunning(true);
      const fileId = via === 'library' ? (file?.id ?? null) : null;
      try {
        const forced = rerun || tourActive;
        const extra = forced ? { rerun: true } : {};
        let body: CreateRun;
        if (via === 'library' && file) body = { fileId: file.id, mode: 'auto', ...extra };
        else if (via === 'upload' && upload?.status === 'ready') {
          body = {
            text: upload.result.text,
            filename: runFilename(upload.name),
            mode: 'auto',
            formatHint: upload.result.formatHint,
            sourceFormat: upload.result.sourceFormat,
            source: 'upload',
            ...extra,
          };
        } else body = { text: text.trim(), filename: runFilename(name.trim() || 'Pasted notes'), mode: 'auto', source: 'paste', ...extra };
        const res = await api.createRun(body);
        if (res.data.duplicate && res.data.duplicateScope === 'workspace' && !forced) {
          setEarlier({ runId: res.data.runId, createdAt: res.data.duplicateCreatedAt ?? null, mode: res.data.mode });
          setRunning(false);
          return;
        }
        track('run_created', { runId: res.data.runId, fileId, source: via, mode: res.data.mode, tourPath: via === 'library' ? (file?.tourPath ?? null) : null, rerun: forced, duplicate: !!res.data.duplicate });
        invalidate(keys.runs, keys.session);
        // The page can stay mounted (cached route) and be shown again: never leave it busy.
        setRunning(false);
        if (res.data.duplicate) {
          openEarlier(res.data.runId, res.data.mode);
          return;
        }
        emit({ name: 'run.started', runId: res.data.runId, fileId, mode: res.data.mode });
        navigate(`/app/runs/${res.data.runId}`);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'The run could not be started.';
        setRunError(msg);
        toast({ tone: 'danger', title: 'Conversation not processed', body: msg });
        setRunning(false);
      }
    },
    [via, file, upload, text, name, navigate, toast, tourActive, openEarlier],
  );

  const handleFile = useCallback(async (f: File) => {
    const seq = ++readSeq.current;
    setEarlier(null);
    setRunError(null);
    setUpload({ status: 'reading', name: f.name, size: f.size });
    try {
      const result = await convertFile(f);
      if (seq !== readSeq.current) return;
      setUpload({ status: 'ready', name: f.name, size: f.size, result });
      focusRun();
    } catch (err) {
      if (seq !== readSeq.current) return;
      const e = err instanceof ConvertError ? err : null;
      setUpload({
        status: 'error',
        name: f.name,
        size: f.size,
        title: e?.title ?? 'This file can’t be read',
        message: e?.message ?? (err instanceof Error ? err.message : 'Try another file.'),
      });
    }
  }, []);

  const clearUpload = () => {
    readSeq.current++;
    setUpload(null);
    setEarlier(null);
    setRunError(null);
  };

  const chooseFile = () => inputRef.current?.click();

  // A file dropped beside the drop zone would make the browser open it and leave the page.
  useEffect(() => {
    if (via !== 'upload') return;
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, [via]);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!live) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const blockedCustom = live ? null : pausedByOwner ? 'Live AI is turned off, so uploads and pasted text can’t run right now' : 'The live AI budget is used up, so uploads and pasted text can’t run right now';
  const reason: string | null =
    via === 'library'
      ? file
        ? null
        : 'Choose a conversation to continue'
      : blockedCustom
        ? blockedCustom
        : via === 'upload'
          ? !upload
            ? 'Choose a file to continue'
            : upload.status === 'reading'
              ? 'Reading the file'
              : upload.status === 'error'
                ? 'Choose a file Switchboard can read'
                : null
          : textLen < MIN_TEXT_CHARS
            ? `Paste at least ${MIN_TEXT_CHARS} characters (${textLen} so far)`
            : textLen > MAX_TEXT_CHARS
              ? `Text is over the ${fmt(MAX_TEXT_CHARS)} character limit`
              : null;
  const longText = via === 'upload' && upload?.status === 'ready' && upload.result.text.length > 40_000;
  const readyLine =
    via === 'library' && !live
      ? 'Replays a recorded live run at real speed'
      : longText
        ? 'Runs live on the AI models. Long documents take a little longer.'
        : 'Runs live on the AI models in about 3 seconds';

  const libCount = library.data?.length ?? null;

  return (
    <Page>
      <PageHeader title="New conversation" description="Switchboard reads any conversation or document and routes what matters to its owner." />

      {!live ? (
        <Callout tone="warning" title={pausedByOwner ? 'Live AI is turned off' : 'Live AI budget used up'}>
          Uploads and pasted text are paused. Conversations from a connected source still run, as a replay of a recorded live run.
        </Callout>
      ) : null}

      <div className={styles.layout}>
        <Card
          flush
          className={styles.intake}
          footer={
            <div className={styles.footer}>
              <p id={statusId} className={styles.status} aria-live="polite">
                {reason ? <IconInfo size={16} className={styles.statusIcon} /> : <span className={live || via !== 'library' ? styles.liveDot : styles.replayDot} aria-hidden="true" />}
                <span>{reason ?? readyLine}</span>
              </p>
              <Tooltip label={reason ?? ''} disabled={!reason}>
                <span className={styles.runWrap} tabIndex={reason ? 0 : undefined}>
                  <Button
                    variant="primary"
                    iconRight={<IconArrowRight />}
                    loading={running}
                    disabled={!!reason || running}
                    aria-describedby={statusId}
                    onClick={() => void startRun(false)}
                    className={styles.runButton}
                    {...tourAnchor('new.run')}
                  >
                    Process conversation
                  </Button>
                </span>
              </Tooltip>
            </div>
          }
        >
          <div className={styles.tabbar}>
            <Tabs<Via>
              label="How to bring it in"
              value={via}
              onChange={setVia}
              items={[
                { value: 'library', label: <TabLabel long="From a connected source" short="Connected source" />, attrs: { id: 'via-library', 'aria-controls': 'via-panel' } },
                { value: 'upload', label: <TabLabel long="Upload a file" short="Upload" />, attrs: { id: 'via-upload', 'aria-controls': 'via-panel' } },
                { value: 'paste', label: <TabLabel long="Paste text" short="Paste" />, attrs: { id: 'via-paste', 'aria-controls': 'via-panel' } },
              ]}
            />
          </div>

          <div className={styles.panel} role="tabpanel" id="via-panel" aria-labelledby={`via-${via}`}>
            {via === 'library' ? (
              file ? (
                <LibraryChoice file={file} accountName={file.accountId ? world.accountName(file.accountId) : null} onChange={() => setPickerOpen(true)} />
              ) : (
                <div className={styles.empty}>
                  <span className={styles.marks} aria-hidden="true">
                    {SOURCE_MARKS.map((id) => (
                      <ConnectorMark key={id} id={id} size={28} />
                    ))}
                  </span>
                  <p className={cx(styles.emptyTitle, styles.titleRow)}>
                    Choose a conversation
                    <SimulatedBadge tip={SIMULATED_TIP.sources} />
                  </p>
                  <p className={styles.emptyText}>
                    {libCount ? `${libCount} sample calls, notes, email threads and chat exports, standing in for your connected tools.` : 'Sample calls, notes, email threads and chat exports, standing in for your connected tools.'}
                  </p>
                  <Button variant="secondary" icon={<IconFolder />} onClick={() => setPickerOpen(true)} {...tourAnchor('new.upload')}>
                    Browse conversations
                  </Button>
                </div>
              )
            ) : via === 'upload' ? (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleFile(f);
                  }}
                />
                {upload && upload.status !== 'error' ? (
                  <UploadChoice upload={upload} onReplace={chooseFile} onRemove={clearUpload} />
                ) : (
                  <div className={styles.uploadStack}>
                    {upload?.status === 'error' ? (
                      <Callout tone="danger" title={upload.title}>
                        <span className={styles.errorFile}>{upload.name}</span>
                        {upload.message}
                      </Callout>
                    ) : null}
                    <div
                      className={cx(styles.dropzone, dragOver && styles.dropzoneOver, !live && styles.dropzoneOff)}
                      onClick={(e) => {
                        if (live && !(e.target as HTMLElement).closest('button')) chooseFile();
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        if (live) setDragOver(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = live ? 'copy' : 'none';
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
                      }}
                      onDrop={onDrop}
                    >
                      <span className={styles.dropIcon} aria-hidden="true">
                        <IconUpload size={20} />
                      </span>
                      <p className={styles.emptyTitle}>{dragOver ? 'Drop to upload' : 'Drop a file here'}</p>
                      <p className={styles.emptyText}>PDF, Word, PowerPoint, Excel, transcripts, email and chat exports, CSV or text.</p>
                      <Button variant="secondary" disabled={!live} onClick={chooseFile}>
                        Choose file
                      </Button>
                      <p className={styles.dropNote}>Read in your browser. Up to {fmt(MAX_TEXT_CHARS)} characters.</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.paste}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="paste-name">
                    Name <span className={styles.optional}>(optional)</span>
                  </label>
                  <Input id="paste-name" className={styles.nameInput} value={name} placeholder="Pasted notes" maxLength={160} disabled={!live} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="paste-text">
                    Conversation or document
                  </label>
                  <Textarea
                    id="paste-text"
                    rows={10}
                    value={text}
                    disabled={!live}
                    aria-invalid={textLen > MAX_TEXT_CHARS || undefined}
                    placeholder={'[00:01:12] Dana (Brightline): Our offline conversions land in Google Ads two days late.\n[00:01:30] Marcus (Invoca): Got it. Which campaigns?'}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <div className={styles.pasteMeta}>
                    <span>Personal details are removed before any AI sees the text.</span>
                    <span className={cx(styles.count, textLen > MAX_TEXT_CHARS && styles.countOver)}>
                      {fmt(textLen)} / {fmt(MAX_TEXT_CHARS)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {earlier ? (
              <Callout
                tone="info"
                title="You already ran this file"
                attrs={{ 'data-testid': 'earlier-run-choice' }}
                actions={
                  <>
                    <Button size="sm" onClick={() => openEarlier(earlier.runId, earlier.mode)}>
                      Open your earlier run
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => void startRun(true)}>
                      Run again live
                    </Button>
                  </>
                }
              >
                It matches your run from {earlier.createdAt ? <When value={earlier.createdAt} /> : 'earlier'}. Open it, or run it again live (this uses some of the shared AI budget).
              </Callout>
            ) : null}
            {runError ? (
              <Callout tone="danger" title="The conversation wasn’t processed">
                {runError}
              </Callout>
            ) : null}
          </div>
        </Card>

        <Card title="What Switchboard does with it" className={styles.aside}>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.title} className={styles.step}>
                <span className={styles.stepNum} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>{s.title}</span>
                  <span className={styles.stepLine}>{s.line}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <FilePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        returnFocus={() => document.querySelector<HTMLElement>('[data-tour="new.upload"]')?.focus()}
        onOpenFile={(f) => {
          setFile(f);
          setEarlier(null);
          setRunError(null);
          setCached(keys.libraryFile(f.id), (prev) => prev);
          focusRun();
        }}
      />
    </Page>
  );
}

function TabLabel({ long, short }: { long: string; short: string }) {
  return (
    <>
      <span className={styles.tabLong}>{long}</span>
      <span className={styles.tabShort}>
        {short}
      </span>
    </>
  );
}

/** The first lines of the text, as it will be read. */
function TextPreview({ text, aside }: { text: string | null; aside?: ReactNode }) {
  const lines = text === null ? null : previewLines(text);
  return (
    <div className={styles.preview}>
      <div className={styles.previewHead}>
        <span className={styles.previewLabel}>Preview</span>
        {aside ? <span className={styles.previewAside}>{aside}</span> : null}
      </div>
      {lines === null ? (
        <div className={styles.previewSkel} aria-hidden="true">
          {[94, 82, 88, 64].map((w) => (
            <Skeleton key={w} width={`${w}%`} height={8} />
          ))}
        </div>
      ) : (
        <div className={styles.previewBox}>
          <p className={styles.previewText}>{lines}</p>
        </div>
      )}
    </div>
  );
}

function LibraryChoice({ file, accountName, onChange }: { file: LibraryFile; accountName: string | null; onChange: () => void }) {
  const content = useLibraryFile(file.id);
  const source = librarySource(file);
  const edge = file.edgeKind ? EDGE[file.edgeKind] : null;
  const level = file.messLevel;
  const reveal = edge ?? (level ? LEVEL[level] : null);
  return (
    <div className={styles.choice}>
      <div className={styles.fileHead}>
        <ConnectorMark id={source} size={36} />
        <div className={styles.fileTitle}>
          <span className={styles.fileName} title={file.filename}>
            {file.filename}
          </span>
          <span className={styles.fileMeta}>
            <span className={styles.metaItem}>{accountName ?? 'Not linked to an account'}</span>
            <span className="ds-mono">{file.callId}</span>
          </span>
        </div>
        <Button size="sm" onClick={onChange} className={styles.changeButton} {...tourAnchor('new.upload')}>
          Change
        </Button>
      </div>

      <KeyValue
        stacked
        className={styles.facts}
        items={[
          {
            label: 'Source',
            value: (
              <span className={styles.sourceValue}>
                <ConnectorMark id={source} size={16} />
                {sourceLabel(source)}
                <SimulatedBadge tip={SIMULATED_TIP.sources} />
              </span>
            ),
          },
          { label: 'Call type', value: file.callType },
          { label: 'Size', value: <span className="ds-num">{bytes(file.sizeBytes)}</span> },
          { label: 'Modified', value: dateShort(file.modifiedAt) },
        ]}
      />

      {reveal ? (
        <div className={styles.reveal}>
          <div className={styles.revealHead}>
            {edge ? (
              <Badge tone="warning">Edge case</Badge>
            ) : level ? (
              <>
                <span className={styles.revealLabel}>Complexity</span>
                <span className={styles.levels} role="img" aria-label={`Complexity ${level} of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={n <= level ? styles.levelOn : styles.level} />
                  ))}
                </span>
                <span className={styles.levelText}>{level} of 5</span>
              </>
            ) : null}
          </div>
          <p className={styles.revealName}>{reveal.name}</p>
          <p className={styles.revealLine}>{reveal.line}</p>
        </div>
      ) : null}

      {content.error ? null : <TextPreview text={content.data?.content ?? null} />}
    </div>
  );
}

function UploadChoice({ upload, onReplace, onRemove }: { upload: Exclude<Upload, { status: 'error' }>; onReplace: () => void; onRemove: () => void }) {
  const ext = extOf(upload.name).toUpperCase().slice(0, 4);
  const ready = upload.status === 'ready' ? upload.result : null;
  const pages = ready ? pagesLabel(ready) : null;
  return (
    <div className={styles.choice}>
      <div className={styles.fileHead}>
        <span className={styles.fileTile} aria-hidden="true">
          {ready ? ext || 'TXT' : <Spinner />}
        </span>
        <div className={styles.fileTitle}>
          <span className={styles.fileName} title={upload.name}>
            {upload.name}
          </span>
          <span className={styles.fileMeta}>
            {ready ? (
              <>
                <span className={styles.metaItem}>{ready.label}</span>
                {pages ? <span>{pages}</span> : null}
                <span className="ds-num">{bytes(upload.size)}</span>
              </>
            ) : (
              <span>Reading the file</span>
            )}
          </span>
        </div>
        <span className={styles.fileAction}>
          <Button size="sm" onClick={onReplace}>
            Replace
          </Button>
          <IconButton size="sm" label="Remove file" icon={<IconX />} onClick={onRemove} />
        </span>
      </div>

      {ready?.warnings.map((w) => (
        <Callout key={w} tone="warning">
          {w}
        </Callout>
      ))}

      <TextPreview text={ready ? ready.text : null} aside={ready ? `${fmt(ready.text.length)} characters` : undefined} />
    </div>
  );
}
