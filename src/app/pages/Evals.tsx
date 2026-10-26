/**
 * Quality: how accurate Signal Loop is, measured on hand-labelled test files. Leads with the
 * verdict on the live prompt, then the numbers behind it, then the candidate prompt and its
 * go-live check.
 */
import type { EvalRun } from '../../shared/contracts';
import { metricPct, rateOf } from '../../shared/format';
import { tourAnchor } from '../../tour/anchors';
import { Badge, Button, Callout, Card, EmptyState, Page, PageHeader, Skeleton, Stats, Table, TableSkeleton, Tooltip, type StatItem } from '../../ds';
import { IconBeaker, IconInfo } from '../../ds/icons';
import { useEvals } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState, When } from '../components/domain';
import { money, ms } from '../lib/labels';
import { CandidateCompare, LevelHeat, SafetyTable, TypeTable } from './evals/EvalParts';
import { PromotionGate } from './evals/PromotionGate';
import { metric, passed, pooledMetric, thresholdLabel, ver, type Metric } from './evals/evalModel';
import styles from './evals/Evals.module.css';

const counts = (m: Metric | null, noun: string) => (m?.numerator != null && m.denominator != null ? `${m.numerator} of ${m.denominator} ${noun}` : 'Not measured');

function Info({ label }: { label: string }) {
  return (
    <Tooltip label={label}>
      <span tabIndex={0} className={styles.info} aria-label={label}>
        <IconInfo size={14} />
      </span>
    </Tooltip>
  );
}

function stat(m: Metric | null, label: string, noun: string, help: string): StatItem {
  const p = passed(m);
  return {
    label,
    info: <Info label={`${help}${m?.threshold != null ? ` Go-live needs ${thresholdLabel(m)}.` : ''}`} />,
    value: m ? metricPct(m, rateOf(m) === 0 || rateOf(m) === 1 ? 0 : 1) : '—',
    sub: (
      <span className={styles.statSub}>
        <span>{counts(m, noun)}</span>
        {p === false ? <Badge tone="danger">Below target</Badge> : null}
      </span>
    ),
  };
}

function EvalsSkeleton() {
  return (
    <div className="ds-stack" style={{ gap: 24 }} aria-busy="true" aria-label="Loading quality">
      <Skeleton height={64} radius={8} />
      <Skeleton height={104} radius={8} />
      <div className={styles.pair}>
        <TableSkeleton rows={6} cols={3} />
        <TableSkeleton rows={2} cols={5} />
      </div>
    </div>
  );
}

export default function EvalsPage() {
  useDocumentTitle('Quality');
  const evals = useEvals();

  const header = <PageHeader title="Quality" description="How accurate Signal Loop is, measured on hand-labelled test files before any prompt goes live." />;

  if (evals.loading) {
    return (
      <Page>
        {header}
        <EvalsSkeleton />
      </Page>
    );
  }
  if (evals.error && !evals.data) {
    return (
      <Page>
        {header}
        <Card>
          <ErrorState error={evals.error} onRetry={() => void evals.refresh()} what="quality results" />
        </Card>
      </Page>
    );
  }

  const { latest, history, candidate } = evals.data!;
  const live = ver(latest.promptVersion);
  const rules = latest.metrics.filter((m) => m.threshold != null && !m.key.startsWith('regression.'));
  const failing = rules.filter((m) => passed(m) === false);
  const P = metric(latest, 'precision') ?? pooledMetric(latest, 'precision');
  const R = metric(latest, 'recall') ?? pooledMetric(latest, 'recall');
  const hist = [...history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const scrollToCandidate = () => document.getElementById('candidate')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <Page>
      {header}

      <Callout
        tone={failing.length ? 'warning' : 'success'}
        title={
          failing.length ? `Prompt ${live} is live, with ${failing.length} of ${rules.length} go-live checks below target` : `Prompt ${live} is live and passes all ${rules.length} go-live checks`
        }
        actions={
          candidate ? (
            <Button size="sm" onClick={scrollToCandidate}>
              Review candidate {ver(candidate.promptVersion)}
            </Button>
          ) : undefined
        }
      >
        Tested on {latest.files} hand-labelled files, last run <When value={latest.createdAt} />. A model from a different AI family grades only the unclear matches.
      </Callout>

      <Stats
        items={[
          stat(P, 'Precision', 'correct', 'Of everything the AI pulled out, how much was right.'),
          stat(R, 'Recall', 'found', 'Of the insights planted in the test files, how many the AI found.'),
          stat(metric(latest, 'grounding_rate'), 'Quotes grounded', 'found in the conversation', 'Kept quotes that really appear in the conversation, word for word or a close match.'),
          stat(metric(latest, 'negative_fp_rate'), 'Invented on empty calls', 'test calls', 'Test calls with nothing actionable where the AI still reported an insight. Lower is better.'),
        ]}
      />

      <div className={styles.pair}>
        <Card title="Accuracy by insight type" description="Precision and recall for each type, with counts." flush attrs={tourAnchor('evals.metrics')}>
          <TypeTable run={latest} />
        </Card>
        <Card title="Accuracy by how messy the file is" description="From clean notes to chaotic forwarded threads. Real calls sit in the messiest three." flush attrs={tourAnchor('evals.levels')}>
          <LevelHeat run={latest} />
        </Card>
      </div>

      <Card title="Safety and routing" description="The failures that matter more than accuracy: made-up quotes, invented work, hidden instructions and health information." flush>
        <SafetyTable run={latest} />
      </Card>

      {candidate ? (
        <Card
          id="candidate"
          title={
            <span className={styles.candidateTitle}>
              Candidate prompt {ver(candidate.promptVersion)}
              <Badge tone="warning">Not live</Badge>
            </span>
          }
          description={`Tested on the same ${candidate.files} labelled files as ${live}, scored the same way.`}
          attrs={tourAnchor('evals.candidate')}
          flush
        >
          <div className={styles.candidate}>
            <CandidateCompare candidate={candidate} current={latest} />
            <PromotionGate candidate={candidate} current={latest} />
          </div>
        </Card>
      ) : (
        <Card id="candidate" title="Candidate prompt" attrs={tourAnchor('evals.candidate')}>
          <EmptyState compact icon={<IconBeaker />} title="No candidate waiting" description="A new prompt version appears here after its test run, with its go-live check." />
        </Card>
      )}

      <Card title="Prompt history" description="Every version ran the full set of labelled files before it could go live." flush>
        {hist.length === 0 ? (
          <EmptyState compact title="No test history yet" />
        ) : (
          <Table label="Prompt history" minWidth={680}>
            <thead>
              <tr>
                <th>Prompt</th>
                <th className="is-num">Precision</th>
                <th className="is-num">Recall</th>
                <th className="is-num">Level 5 recall</th>
                <th className="is-num">Slowest 5%</th>
                <th className="is-num">Test cost</th>
                <th>Result</th>
                <th className="is-num">Tested</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((r: EvalRun) => {
                const p = metric(r, 'precision') ?? pooledMetric(r, 'precision');
                const rc = metric(r, 'recall') ?? pooledMetric(r, 'recall');
                const l5 = metric(r, 'recall.level5');
                return (
                  <tr key={r.id}>
                    <td className="is-nowrap">
                      <span className={styles.version}>
                        <span className={styles.versionName}>{ver(r.promptVersion)}</span>
                        {r.id === latest.id ? <Badge tone="accent">Live</Badge> : null}
                      </span>
                    </td>
                    <td className="is-num">
                      <RateText m={p} />
                    </td>
                    <td className="is-num">
                      <RateText m={rc} />
                    </td>
                    <td className="is-num">
                      <RateText m={l5} />
                    </td>
                    <td className="is-num">{ms(r.p95Ms)}</td>
                    <td className="is-num">{money(r.costUsd, { precise: true })}</td>
                    <td className="is-nowrap">
                      <Badge tone={r.promoted ? 'success' : 'danger'} dot>
                        {r.promoted ? 'Promoted' : 'Blocked'}
                      </Badge>
                    </td>
                    <td className="is-num ds-muted">
                      <When value={r.createdAt} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  );
}

function RateText({ m }: { m: Metric | null }) {
  if (!m) return <span className="ds-subtle">—</span>;
  return (
    <span className={styles.rateText}>
      {metricPct(m)}
      {m.numerator != null && m.denominator != null ? (
        <span className={styles.rateTextCount}>
          {m.numerator} of {m.denominator}
        </span>
      ) : null}
    </span>
  );
}
