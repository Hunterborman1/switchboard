/**
 * New call: bring a conversation in from the library (the file picker), paste text, or drop
 * a file. After a library pick the file card reveals its complexity (mess level 1–5) or edge
 * kind — never before, so the choice feels real. "Run pipeline" creates the run and opens
 * the Run view.
 */
import { useCallback, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import type { EdgeKind, LibraryFile, MessLevel } from '../../shared/contracts';
import { STEP_KEYS, STEP_LABELS } from '../../shared/contracts';
import { emit } from '../../shared/events';
import { tourAnchor } from '../../tour/anchors';
import { Button } from '../../system/components/primitives/Button.jsx';
import { Textarea } from '../../system/components/forms/Textarea.jsx';
import { Input } from '../../system/components/forms/Input.jsx';
import { MonoId } from '../../uis/MonoId';
import { Banner } from '../../uis/Banner';
import { api, ApiError } from '../api/client';
import { invalidate, keys, setCached, useLibrary, useSession } from '../api/hooks';
import { FilePicker } from '../components/FilePicker';
import { AppPageHeader, Panel, WhyDisabled, useToast } from '../components/ui';
import { FileGlyph, IconDrop, IconLibrary, IconPaste, IconShield, IconUpload } from '../components/icons';
import { bytes, dateTime, STEP_HELP } from '../lib/labels';
import { useWorldIndex } from '../lib/world';
import { usePrefersReducedMotion } from '../state';
import { track } from '../telemetry';
import styles from './NewCall.module.css';

type Source = 'library' | 'paste' | 'drop';

const LEVEL: Record<MessLevel, { name: string; line: string }> = {
  1: { name: 'Clean notes', line: 'Structured CSM notes. The baseline: nothing to untangle.' },
  2: { name: 'Tidy transcript', line: 'Speaker-labelled with timestamps; several insights in one call.' },
  3: { name: 'Real conversation', line: 'Filler, tangents and small talk; insights span several turns.' },
  4: { name: 'Messy speech-to-text', line: 'Raw ASR: homophones (“in vocal”), speaker swaps, [crosstalk], hedged complaints.' },
  5: { name: 'Chaos', line: 'Slack shorthand, forwarded threads, partial transcripts; context has to be inferred.' },
};

const EDGE: Record<EdgeKind, { name: string; line: string }> = {
  nothing_actionable: { name: 'Nothing actionable', line: 'A friendly check-in. The right answer is zero insights, and the system should say so.' },
  injection: { name: 'Prompt injection attempt', line: 'Contains instructions aimed at an AI. Watch the screen step treat them as inert data.' },
  phi_heavy: { name: 'PHI-heavy healthcare call', line: 'Patient details everywhere. Redaction swaps them for tokens before any model sees the text.' },
  non_english: { name: 'Non-English', line: 'Not in English. Screening detects the language; extraction still grounds every quote.' },
  duplicate: { name: 'Duplicate re-upload', line: 'An exact copy of an earlier file. Ingest recognises the SHA-256 and skips it.' },
};

const ACCEPT = '.vtt,.txt,.md,.eml,.chat,text/plain,text/markdown,text/vtt,message/rfc822';

export default function NewCallPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const world = useWorldIndex();
  const reduced = usePrefersReducedMotion();
  const session = useSession();
  const library = useLibrary();
  const live = session.data?.budget.liveEnabled ?? true;

  const [source, setSource] = useState<Source>('library');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [file, setFile] = useState<LibraryFile | null>(null);
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('pasted-notes.txt');
  const [dropped, setDropped] = useState<{ name: string; size: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textLen = text.trim().length;
  const textOk = textLen >= 40 && textLen <= 60_000;

  const startRun = useCallback(async () => {
    setRunError(null);
    setRunning(true);
    try {
      const body =
        source === 'library' && file
          ? { fileId: file.id, mode: 'auto' as const }
          : { text: text.trim(), filename: (filename || 'pasted-notes.txt').slice(0, 120), mode: 'auto' as const };
      const res = await api.createRun(body);
      emit({ name: 'run.started', runId: res.data.runId, fileId: source === 'library' ? file?.id ?? null : null, mode: res.data.mode });
      track('run_created', { runId: res.data.runId, fileId: source === 'library' ? file?.id ?? null : null, source, mode: res.data.mode, tourPath: file?.tourPath ?? null });
      invalidate(keys.runs, keys.session);
      navigate(`/app/runs/${res.data.runId}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'The run could not be started.';
      setRunError(msg);
      toast({ tone: 'danger', title: 'Run not started', body: msg });
      setRunning(false);
    }
  }, [source, file, text, filename, navigate, toast]);

  const readFile = useCallback(
    (f: File) => {
      if (f.size > 600_000) {
        toast({ tone: 'warning', title: 'File too large', body: `${f.name} is ${bytes(f.size)}; the limit is 600 KB of text.` });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result ?? '');
        setText(content);
        setFilename(f.name.slice(0, 120));
        setDropped({ name: f.name, size: f.size });
      };
      reader.readAsText(f);
    },
    [toast],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) readFile(f);
  };

  const account = file ? world.account(file.accountId) : null;
  const canRunCustom = live;
  const runDisabledReason =
    source === 'library'
      ? !file
        ? 'Choose a file from the library first'
        : null
      : !canRunCustom
        ? 'Live AI budget reached: custom text is paused. Library files still replay recorded live runs.'
        : source === 'drop' && !dropped
          ? 'Drop or choose a file first'
          : !textOk
            ? textLen < 40
              ? `Paste at least 40 characters (${textLen} so far)`
              : 'Text is over the 60,000 character limit'
            : null;

  const libCount = library.data?.length ?? null;

  const options: { key: Source; title: string; sub: string; icon: ReactNode }[] = useMemo(
    () => [
      { key: 'library', title: 'From the library', sub: libCount != null ? `${libCount} recorded calls, notes and emails` : 'Recorded calls, notes and emails', icon: <IconLibrary size={20} /> },
      { key: 'paste', title: 'Paste text', sub: 'Notes or a transcript, 40 – 60,000 characters', icon: <IconPaste size={20} /> },
      { key: 'drop', title: 'Drop a file', sub: '.vtt  .txt  .md  .eml  .chat', icon: <IconDrop size={20} /> },
    ],
    [libCount],
  );

  return (
    <div className="sl-page">
      <AppPageHeader title="New call" dataAsOf={library.dataAsOf ?? session.dataAsOf} />

      <div className={styles.layout}>
        <div className={styles.main}>
          <Panel
            title="Bring in a conversation"
            sub="Signal Loop turns one customer conversation into routed, evidence-backed product insight."
          >
            <div className={styles.sources} role="tablist" aria-label="Source">
              {options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="tab"
                  id={`src-${o.key}`}
                  aria-selected={source === o.key}
                  aria-controls={`panel-${o.key}`}
                  className={`${styles.source} ${source === o.key ? styles.sourceActive : ''}`}
                  onClick={() => setSource(o.key)}
                >
                  <span className={styles.sourceIcon}>{o.icon}</span>
                  <span className={styles.sourceText}>
                    <span className={styles.sourceTitle}>{o.title}</span>
                    <span className={styles.sourceSub}>{o.sub}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.sourceBody} role="tabpanel" id={`panel-${source}`} aria-labelledby={`src-${source}`}>
              {source === 'library' ? (
                <AnimatePresence mode="wait" initial={false}>
                  {!file ? (
                    <motion.div
                      key="empty"
                      className={styles.pickZone}
                      initial={reduced ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? undefined : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className={styles.pickArt} aria-hidden="true">
                        <FileGlyph format="vtt" size={40} />
                        <FileGlyph format="md" size={40} />
                        <FileGlyph format="eml" size={40} />
                      </div>
                      <p className={styles.pickTitle}>Choose a call from the library</p>
                      <p className={styles.pickSub}>A synthetic, Invoca-shaped export: QBRs, renewals, escalations, CSM notes and forwarded emails, from clean to chaotic.</p>
                      <Button
                        variant="primary"
                        size="lg"
                        iconLeft="plus"
                        onClick={() => setPickerOpen(true)}
                        {...tourAnchor('new.upload')}
                      >
                        Upload from library…
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={file.id}
                      initial={reduced ? false : { opacity: 0, y: 8, scale: 0.99 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? undefined : { opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <FileCard file={file} accountName={account?.name ?? (file.accountId ? file.accountId : 'Not linked to an account')} accountMeta={account ? `${account.tier} · ${account.vertical.replace('_', ' ')}` : null} reduced={reduced} onChange={() => setPickerOpen(true)} />
                    </motion.div>
                  )}
                </AnimatePresence>
              ) : source === 'paste' ? (
                <div className={styles.pasteWrap}>
                  {!canRunCustom ? (
                    <Banner tone="warning" title="Live AI budget reached">
                      Custom text needs a live model call, and the $15 viewer budget is used up. Library files still run by replaying a recorded live run.
                    </Banner>
                  ) : null}
                  <label className={styles.fieldLabel} htmlFor="paste-name">
                    File name
                  </label>
                  <Input id="paste-name" value={filename} onChange={(e) => setFilename(e.target.value)} maxLength={120} style={{ maxWidth: 360 }} />
                  <label className={styles.fieldLabel} htmlFor="paste-text">
                    Notes or transcript
                  </label>
                  <Textarea
                    id="paste-text"
                    rows={10}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={'[00:01:12] Dana (Brightline): Our offline conversions land in Google Ads two days late…\n[00:01:30] Marcus (Invoca): Got it, which campaigns?'}
                    mono
                    disabled={!canRunCustom}
                  />
                  <div className={styles.counter}>
                    <span className={textOk ? undefined : styles.counterBad}>{textLen.toLocaleString()}</span> / 60,000 characters · minimum 40 · names, phones, emails and PHI are redacted before any model sees the text
                  </div>
                </div>
              ) : (
                <div
                  className={`${styles.dropZone} ${dragOver ? styles.dropOver : ''} ${!canRunCustom ? styles.dropDisabled : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (canRunCustom) setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => (canRunCustom ? onDrop(e) : e.preventDefault())}
                >
                  <IconUpload size={28} />
                  {dropped ? (
                    <>
                      <p className={styles.pickTitle}>{dropped.name}</p>
                      <p className={styles.pickSub}>
                        {bytes(dropped.size)} · {textLen.toLocaleString()} characters read · ready to run
                      </p>
                    </>
                  ) : (
                    <>
                      <p className={styles.pickTitle}>Drop a transcript or notes file here</p>
                      <p className={styles.pickSub}>WebVTT, plain text, Markdown, email (.eml) or a chat export. Read locally; only redacted text reaches a model.</p>
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept={ACCEPT} hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={!canRunCustom}>
                    {dropped ? 'Choose a different file' : 'Browse your computer…'}
                  </Button>
                  {!canRunCustom ? <WhyDisabled reason="Live AI budget reached: custom files are paused." /> : null}
                </div>
              )}
            </div>

            <div className={styles.runBar}>
              <div className={styles.runInfo}>
                <span className={`${styles.modeDot} ${live ? styles.modeLive : styles.modeReplay}`} aria-hidden="true" />
                <span>
                  {live ? (
                    <>
                      Runs <strong>live</strong> on the real models
                      {session.data ? <span className="sl-subtle"> · {session.data.models.primary}</span> : null}
                    </>
                  ) : (
                    <>
                      <strong>Replay mode</strong>: the run replays a recorded live run at real speed
                    </>
                  )}
                </span>
              </div>
              <div className={styles.runAction}>
                {runDisabledReason ? <WhyDisabled reason={runDisabledReason} /> : null}
                <Button
                  variant="primary"
                  size="lg"
                  iconLeft="play"
                  loading={running}
                  disabled={!!runDisabledReason || running}
                  onClick={() => void startRun()}
                  title={runDisabledReason ?? 'Start the 10-step pipeline'}
                  {...tourAnchor('new.run')}
                >
                  Run pipeline
                </Button>
              </div>
            </div>
            {runError ? (
              <div style={{ marginTop: 'var(--sp-3)' }}>
                <Banner tone="danger" title="The run did not start">
                  {runError}
                </Banner>
              </div>
            ) : null}
          </Panel>
        </div>

        <aside className={styles.side}>
          <Panel title="What happens next" sub="Ten durable steps. Every one writes a record the Run view animates from.">
            <ol className={styles.steps}>
              {STEP_KEYS.map((k, i) => (
                <li key={k} className={styles.step}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <span>
                    <span className={styles.stepName}>{STEP_LABELS[k]}</span>
                    <span className={styles.stepHelp}>{STEP_HELP[k]}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
          <div className={styles.trust}>
            <IconShield size={18} />
            <span>
              <strong>No quote, no insight.</strong> Every insight carries a verbatim quote that code (not a model) finds in the transcript. Unfound quotes are dropped and counted.
            </span>
          </div>
        </aside>
      </div>

      <FilePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        returnFocus={() => document.querySelector<HTMLElement>('[data-tour="new.upload"]')?.focus()}
        onOpenFile={(f) => {
          setFile(f);
          setSource('library');
          setCached(keys.libraryFile(f.id), (prev) => prev);
          window.setTimeout(() => document.querySelector<HTMLElement>('[data-tour="new.run"]')?.focus(), 60);
        }}
      />
    </div>
  );
}

function FileCard({
  file,
  accountName,
  accountMeta,
  reduced,
  onChange,
}: {
  file: LibraryFile;
  accountName: string;
  accountMeta: string | null;
  reduced: boolean;
  onChange: () => void;
}) {
  const level = file.messLevel;
  const edge = file.edgeKind;
  const reveal = edge ? EDGE[edge] : level ? LEVEL[level] : null;
  return (
    <div className={styles.fileCard}>
      <div className={styles.fileTop}>
        <FileGlyph format={file.format} size={44} />
        <div className={styles.fileTitleWrap}>
          <div className={styles.fileName} title={file.filename}>
            {file.filename}
          </div>
          <div className={styles.fileSub}>
            {accountName}
            {accountMeta ? <span className="sl-subtle"> · {accountMeta}</span> : null}
          </div>
        </div>
        <Button variant="tertiary" size="sm" onClick={onChange} {...tourAnchor('new.upload')}>
          Change file
        </Button>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Call</dt>
          <dd>
            <MonoId value={file.callId} keep={12} />
          </dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{file.callType}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd className="sl-mono">{bytes(file.sizeBytes)}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{dateTime(file.modifiedAt)}</dd>
        </div>
      </dl>
      {reveal ? (
        <motion.div
          className={`${styles.reveal} ${edge ? styles.revealEdge : ''}`}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : 0.25, duration: 0.3 }}
        >
          <div className={styles.revealHead}>
            <span className={styles.revealEyebrow}>{edge ? 'Edge case revealed' : 'Complexity revealed'}</span>
            {level && !edge ? (
              <span className={styles.meter} role="img" aria-label={`Complexity ${level} of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <motion.i
                    key={n}
                    className={n <= level ? styles.meterOn : undefined}
                    initial={reduced ? false : { scaleY: 0.3, opacity: 0.3 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ delay: reduced ? 0 : 0.35 + n * 0.07, duration: 0.2 }}
                  />
                ))}
                <span className={styles.meterLabel}>{level} / 5</span>
              </span>
            ) : null}
          </div>
          <div className={styles.revealName}>{reveal.name}</div>
          <p className={styles.revealLine}>{reveal.line}</p>
        </motion.div>
      ) : null}
    </div>
  );
}
