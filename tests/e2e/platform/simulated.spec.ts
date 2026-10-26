/**
 * Only the real agent opens in Agent Ops. The simulated RFP Responder is listed everywhere with
 * its Simulated label and counts in every total, but nothing about it is a link, a clickable
 * row or a focus stop, and its old URLs land on the matching list page.
 */
import { expect, test, type Page } from '@playwright/test';
import { anchor, BASE, open, signIn } from './helpers';

const RFP = 'agt_rfp_responder';
const SL = 'agt_signal_loop';

test.beforeEach(async ({ context }) => signIn(context));

/** No link anywhere on the page points at a simulated-agent page, runbook or filter. */
async function noRfpLinks(page: Page) {
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  expect(hrefs.filter((h) => h.includes(RFP) || h.includes('/runbook/'))).toEqual([]);
}

/** A row about the simulated agent holds no link, button or focus stop, and has no row affordance. */
async function plainRow(page: Page, row: ReturnType<Page['locator']>) {
  await expect(row).toBeVisible();
  await expect(row.locator('a, button, [tabindex]')).toHaveCount(0);
  await expect(row).not.toHaveClass(/is-clickable/);
  expect(await row.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('pointer');
  await expect(row).toContainText('Simulated');
}

test('registry: the simulated agent is a plain row; Signal Loop opens', async ({ page }) => {
  await open(page, '/ops/agents');
  const table = anchor(page, 'ops.registry');
  await plainRow(page, table.locator(`[data-agent="${RFP}"]`));
  await table.locator(`[data-agent="${RFP}"] td`).first().click();
  await expect(page).toHaveURL(/\/ops\/agents$/);
  const sl = table.locator(`[data-agent="${SL}"]`);
  await expect(sl).toHaveClass(/is-clickable/);
  await expect(sl.locator('td.ao-go svg')).toBeVisible();
  await expect(table.locator(`[data-agent="${RFP}"] td.ao-go svg`)).toHaveCount(0);
  await sl.getByRole('link', { name: /Signal Loop/ }).click();
  await expect(page).toHaveURL(new RegExp(`/ops/agents/${SL}$`));
});

test('overview: impact row and needs-attention items about the simulated agent do not link', async ({ page }) => {
  await open(page, '/ops');
  const impact = page.getByRole('table', { name: 'Impact by agent' });
  await plainRow(page, impact.locator(`[data-agent="${RFP}"]`));
  await expect(impact.locator(`[data-agent="${SL}"]`).getByRole('link', { name: /Signal Loop/ })).toHaveAttribute('href', `${BASE}/ops/agents/${SL}`);
  const att = anchor(page, 'ops.overview.attention');
  await expect(att).toContainText('eval suite with promotion gate');
  await expect(att).toContainText('Answer library sync');
  // The seeded gap, alert and review are all about the simulated agent: plain items, no chevron.
  expect(await att.locator('[data-simulated="true"]').count()).toBeGreaterThanOrEqual(3);
  await expect(att.locator('[data-simulated="true"]').first().locator('svg.ao-att__go')).toHaveCount(0);
  await noRfpLinks(page);
});

test('standard: the simulated agent’s name, cells and gap are plain; its evidence still shows', async ({ page }) => {
  await open(page, '/ops/standard');
  const matrix = page.getByRole('table', { name: 'Agent standard matrix' });
  const rfp = matrix.locator(`[data-agent="${RFP}"]`);
  await expect(rfp.locator('a, button')).toHaveCount(0);
  await expect(rfp.locator('.ao-mcell')).toHaveCount(9);
  await expect(rfp.getByRole('img', { name: /Eval suite with promotion gate: gap/ })).toBeVisible();
  await expect(matrix.locator(`[data-agent="${SL}"] button.ao-mcell`)).toHaveCount(9);
  await expect(page.getByText(/Spot-checks only/).first()).toBeVisible(); // the open gap, as text
  await noRfpLinks(page);
  for (const path of ['/ops/standard/reviews', '/ops/cost', '/ops/summary', '/ops/reliability?agentId=all']) {
    await open(page, path);
    await expect(page.getByText('RFP & Security Questionnaire Responder').first()).toBeVisible();
    await noRfpLinks(page);
  }
});

test('filters list the simulated agent but cannot select it', async ({ page }) => {
  for (const path of ['/ops/usage', '/ops/logs', '/ops/reliability']) {
    await open(page, path);
    const option = page.getByLabel('Agent', { exact: true }).locator(`option[value="${RFP}"]`);
    await expect(option).toHaveText(/\(simulated\)/);
    await expect(option).toBeDisabled();
  }
});

test('reliability: an alert on the simulated agent shows its facts and no actions', async ({ page }) => {
  await open(page, '/ops/reliability?agentId=all');
  const alert = anchor(page, 'ops.alerts').locator('[data-alert="alr_hist_rfp_library"]');
  await expect(alert).toContainText('9 days (Drive connector token expired)');
  await expect(alert).toContainText('Simulated agent, shown for comparison.');
  await expect(alert.locator('a, button')).toHaveCount(0);
});

test('logs: the simulated agent’s lines open nothing; Signal Loop’s still do', async ({ page }) => {
  await open(page, '/ops/logs?component=gumloop'); // the Gumloop area is the simulated agent's
  const rfp = anchor(page, 'ops.logs').locator(`tbody tr[data-agent="${RFP}"]`).first();
  await expect(rfp).toBeVisible();
  await expect(rfp.locator('a, button')).toHaveCount(0);
  await expect(rfp).not.toHaveAttribute('tabindex');
  await expect(rfp).not.toHaveClass(/is-clickable/);
  await rfp.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open trace' })).toHaveCount(0);
  await noRfpLinks(page);
  await open(page, `/ops/logs?agentId=${SL}`);
  const sl = anchor(page, 'ops.logs').locator(`tbody tr[data-agent="${SL}"]`).first();
  await expect(sl).toHaveAttribute('tabindex', '0');
  await expect(sl.getByRole('link')).toHaveCount(1);
});

test('old simulated-agent URLs land on the matching list page', async ({ page }) => {
  const r = await page.request.get(`${BASE}/api/platform/logs?agentId=${RFP}&limit=1`);
  const rfpTrace = ((await r.json()) as { data: { rows: { traceId: string }[] } }).data.rows[0]!.traceId;
  const cases: [string, RegExp, string][] = [
    [`/ops/agents/${RFP}`, /\/ops\/agents$/, 'Agent registry'],
    [`/ops/agents/${RFP}#standard`, /\/ops\/agents$/, 'Agent registry'],
    ['/ops/runbook/rfp-responder#library-sync', /\/ops\/agents$/, 'Agent registry'],
    [`/ops/usage?agentId=${RFP}&source=simulated`, /\/ops\/usage\?source=simulated$/, 'Usage'],
    [`/ops/logs?agentId=${RFP}`, /\/ops\/logs$/, 'Logs and traces'],
    [`/ops/reliability?agentId=${RFP}`, /\/ops\/reliability$/, 'Reliability'],
    [`/ops/traces/${rfpTrace}`, /\/ops\/logs$/, 'Logs and traces'],
  ];
  for (const [from, to, h1] of cases) {
    await page.goto(`${BASE}${from}`);
    await expect(page).toHaveURL(to);
    await expect(page.locator('#main-content h1').first()).toHaveText(h1);
    await expect(page.getByTestId('runbook')).toHaveCount(0);
  }
  // Signal Loop's own pages are unchanged, and an unknown id still says so.
  await open(page, `/ops/agents/${SL}`);
  await expect(anchor(page, 'ops.agent.standard')).toBeVisible();
  await open(page, '/ops/runbook');
  await expect(page.getByTestId('runbook')).toBeVisible();
  await page.goto(`${BASE}/ops/agents/agt_missing`);
  await expect(page.getByText('No agent with that id')).toBeVisible();
});
