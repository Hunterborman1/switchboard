/**
 * Connect Claude: mint a workspace-scoped MCP token and copy ready-made setup for Claude Code
 * and Claude Desktop. The server is src/worker/mcp; tokens last 7 days.
 */
import { useState } from 'react';
import { Badge, Button, Callout, Card, CopyText, Grid, Page, PageHeader, useToast } from '../../ds';
import { IconCheck, IconCopy, IconLock } from '../../ds/icons';
import { request } from '../api/client';
import { useDocumentTitle } from '../AppShell';
import { dateTime } from '../lib/labels';
import styles from './claude/claude.module.css';

type Issued = { token: string; jti: string; expiresAt: string; url: string };

const CAN = [
  { title: 'Read everything', body: 'The walkthrough, README, architecture, design system, runbook and the decision-model report.' },
  { title: 'Query the system', body: 'Conversations, insights, the review queue, themes, routing rules, deliveries, quality, budget, people, connections and Agent Ops traces.' },
  { title: 'Run the pipeline', body: 'Process any conversation you paste into Claude, then approve, edit or reject what it found.' },
];

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.code}>
      <div className={styles.codeHead}>
        <span>{label}</span>
        <Button
          size="sm"
          variant="ghost"
          icon={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className={styles.pre}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function ClaudePage() {
  useDocumentTitle('Connect Claude');
  const toast = useToast();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  // This origin, not the server's guess: in production they match; in local dev it's the dev server.
  const url = `${window.location.origin}/repo/invoca/mcp`;
  const tok = issued?.token ?? '<your token>';

  const create = async () => {
    setBusy(true);
    try {
      const { data } = await request<Issued>('POST', '/mcp/token', {});
      setIssued(data);
    } catch (err) {
      toast({ tone: 'danger', title: 'Couldn’t create a token', body: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const claudeCode = `claude mcp add --transport http switchboard ${url} \\\n  --header "Authorization: Bearer ${tok}"`;
  const desktop = JSON.stringify(
    { mcpServers: { switchboard: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTH_HEADER}'], env: { AUTH_HEADER: `Bearer ${tok}` } } } },
    null,
    2,
  );

  return (
    <Page>
      <PageHeader
        title="Connect Claude"
        description="Give Claude the whole project over MCP: the docs, this workspace’s data and the pipeline itself. Ask it anything about how this was built."
      />

      <Grid cols={3}>
        {CAN.map((c) => (
          <div key={c.title} className={styles.can}>
            <span className={styles.canTitle}>{c.title}</span>
            <span className={styles.canBody}>{c.body}</span>
          </div>
        ))}
      </Grid>

      <Card
        title="1. Create a token"
        description="It acts as your private workspace, like this browser does. It lasts 7 days, or until your access ends."
        actions={
          issued ? (
            <Badge tone="success" dot>
              Ready
            </Badge>
          ) : null
        }
      >
        {issued ? (
          <div className="ds-stack" style={{ gap: 12 }}>
            <div className={styles.tokenRow}>
              <IconLock size={15} />
              <CopyText value={issued.token} display={`${issued.token.slice(0, 18)}…${issued.token.slice(-6)}`} label="Copy token" />
              <span className="ds-subtle">Expires {dateTime(issued.expiresAt)}</span>
            </div>
            <Callout tone="warning">Treat it like a password. Anyone with it can read this workspace and spend from the shared demo budget. It’s shown once.</Callout>
          </div>
        ) : (
          <Button variant="primary" loading={busy} onClick={() => void create()}>
            Create token
          </Button>
        )}
      </Card>

      <Card title="2. Add the server to Claude" description="The commands below fill in the token once you’ve created it.">
        <div className="ds-stack" style={{ gap: 16 }}>
          <CodeBlock label="Claude Code (terminal)" code={claudeCode} />
          <CodeBlock label="Claude Desktop (claude_desktop_config.json, needs Node)" code={desktop} />
          <p className={styles.note}>
            Server URL: <code>{url}</code>. Claude.ai web connectors need OAuth, which this demo doesn’t run, so use Claude Code or Claude Desktop.
          </p>
        </div>
      </Card>

      <Card title="3. Try asking" flush>
        <ul className={styles.asks}>
          {[
            'What was built for this demo, what is simulated, and why?',
            'Process this transcript and explain every step of the result: <paste a call>',
            'Why was this insight sent to review, and what did the second opinion say?',
            'Why was GLM-5.3 Flash chosen as the decision model over the faster main model?',
            'Which themes carry the most ARR, and who owns them?',
          ].map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
