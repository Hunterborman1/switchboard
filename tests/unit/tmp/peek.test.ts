import { it } from 'vitest';
import { runPipeline } from '../../../src/pipeline/run.ts';
import { hashEmbed } from '../../../src/pipeline/theme.ts';
import { memStore } from '../../../scripts/lib/memstore.ts';
import { mockLlm } from '../../helpers/mockLlm.ts';
import { account, fixtureFile, world } from '../../helpers/fixtures.ts';
it('peek', async () => {
  for (const [f, a] of [['brightline-qbr.vtt','acct_brightline'],['meridian-phi.txt','acct_meridian'],['injection.eml','acct_sunpeak'],['friendly.md','acct_sunpeak'],['slack.chat','acct_brightline']] as const) {
    let t = 0;
    const r = await runPipeline({ runId: 'r', workspaceId: 'w', fileId: null, filename: f, content: fixtureFile(f), promptVersion: 'v4', account: account(a), people: world.people, accounts: world.accounts, rules: world.rules },
      { llm: mockLlm(), embed: async (x) => ({ vectors: x.map((y) => hashEmbed(y)), model: 'h' }), vectorQuery: async () => [], store: memStore(), clock: { now: () => (t += 10) } });
    console.log('=====', f, r.status, r.error);
    for (const s of r.steps) console.log(s.key.padEnd(10), s.status.padEnd(8), s.summary);
    console.log(r.turns.map((x) => `${x.id} ${x.speaker} [${x.role}] ${x.text}`).join('\n'));
    console.log(JSON.stringify(r.redactions));
    for (const i of r.insights) console.log(' -', i.type, i.gate, i.confidenceFinal, i.gateReasons.join(' | '), i.ownerId, i.channel);
  }
});
