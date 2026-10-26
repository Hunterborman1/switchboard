/**
 * Analyses: what Switchboard looks for in a conversation. Signal Loop is built and runs on every
 * conversation; the others are the roadmap, listed so the shape of the platform is clear, and
 * marked as not built.
 */
import { Link } from 'react-router-dom';
import { ANALYSIS_NAME, connectorById, type AnalysisDef } from '../../shared/platform';
import { Badge, ButtonLink, Card, ConnectorMark, Page, PageHeader, ProductMark, Section, Skeleton, Stats, Tooltip } from '../../ds';
import { IconArrowRight } from '../../ds/icons';
import { useAnalyses, useReviewQueue, useThemes } from '../api/hooks';
import { useDocumentTitle } from '../AppShell';
import { ErrorState } from '../components/domain';
import styles from './analyses/analyses.module.css';

function Destinations({ def }: { def: AnalysisDef }) {
  return (
    <span className={styles.marks}>
      {def.defaultDestinations.map((id) => {
        const c = connectorById(id);
        return (
          <Tooltip key={id} label={c?.name ?? id}>
            <span tabIndex={0} className={styles.mark}>
              <ConnectorMark id={id} size={20} title={c?.name ?? id} />
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

export default function AnalysesPage() {
  useDocumentTitle('Analyses');
  const analyses = useAnalyses();
  const review = useReviewQueue(false);
  const themes = useThemes();

  const built = (analyses.data ?? []).filter((a) => a.availability === 'built');
  const roadmap = (analyses.data ?? []).filter((a) => a.availability !== 'built');
  const signal = built.find((a) => a.id === 'product_feedback');

  return (
    <Page>
      <PageHeader title="Analyses" description="What Switchboard looks for in each conversation. A fast decision model picks the ones that apply; each sends its results to the tools its owners use." />

      {analyses.loading ? (
        <Card>
          <div className="ds-stack" style={{ gap: 12 }}>
            <Skeleton width={200} height={18} />
            <Skeleton height={10} />
            <Skeleton width="60%" height={10} />
          </div>
        </Card>
      ) : analyses.error && !analyses.data ? (
        <Card>
          <ErrorState error={analyses.error} onRetry={() => void analyses.refresh()} what="analyses" />
        </Card>
      ) : (
        <>
          {signal ? (
            <Card className={styles.featured}>
              <div className={styles.featuredHead}>
                <ProductMark product="signal-loop" size={40} />
                <div className={styles.featuredText}>
                  <div className={styles.featuredTitle}>
                    <h2>{ANALYSIS_NAME}</h2>
                    <Badge tone="success" dot>
                      Built and running
                    </Badge>
                  </div>
                  <p>{signal.description}</p>
                </div>
                <div className={styles.featuredActions}>
                  <ButtonLink to="/app/routing">Routing rules</ButtonLink>
                  <ButtonLink to="/app/insights" variant="primary" iconRight={<IconArrowRight size={15} />}>
                    Open insights
                  </ButtonLink>
                </div>
              </div>
              <Stats
                items={[
                  { label: 'Conversations analysed', value: (signal.runs ?? 0).toLocaleString() },
                  { label: 'Waiting for review', value: review.data ? review.data.length : '—', sub: review.data?.length ? <Link to="/app/review">Open the queue</Link> : 'Nothing waiting' },
                  { label: 'Themes', value: themes.data ? themes.data.length : '—', sub: 'Patterns across accounts' },
                  { label: 'Produces', value: <span className={styles.produces}>{signal.produces}</span> },
                ]}
              />
              <div className={styles.featuredFoot}>
                <span className="ds-muted">Sends to</span>
                <Destinations def={signal} />
              </div>
            </Card>
          ) : null}

          <Section title="On the roadmap" description="Listed so the platform’s shape is clear. They aren’t built, so they never run here.">
            <div className={styles.grid}>
              {roadmap.map((a) => (
                <article key={a.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <h3>{a.name}</h3>
                    <Badge outline>Not built</Badge>
                  </div>
                  <p className={styles.cardDesc}>{a.description}</p>
                  <div className={styles.cardFoot}>
                    <span className={styles.cardProduces}>{a.produces}</span>
                    <Destinations def={a} />
                  </div>
                </article>
              ))}
            </div>
          </Section>
        </>
      )}
    </Page>
  );
}
