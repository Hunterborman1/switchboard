// Model speed test: same messy transcript, same JSON schema, N runs per model.
// Measures time-to-first-token, total latency, output validity and cost.
// Usage: node --env-file=.env scripts/speed-test.ts [runs]
const KEY = process.env.OPENROUTER_BUILD_KEY;
if (!KEY) throw new Error('OPENROUTER_BUILD_KEY missing');

const MODELS = ['xiaomi/mimo-v2.6-pro', 'anthropic/claude-haiku-5.5', 'moonshotai/kimi-k3.1-pro', 'deepseek/deepseek-v4.1-flash'];
const RUNS = Number(process.argv[2] ?? 3);

const transcript = `[00:00:04] Dana (Brightline): ok can you hear me? sorry I'm in the truck
[00:00:09] Marcus (Invoca CSM): yep loud and clear. so, QBR, wanted to walk through call volume and um the google ads piece
[00:01:12] Dana (Brightline): yeah so honestly the offline conversions thing is killing us. like they show up in google ads two, sometimes three days late and our bidding just goes sideways
[00:01:30] Marcus (Invoca CSM): two to three days, ok
[00:01:33] Dana (Brightline): and Jeff keeps forwarding me these call rail emails, they're saying they do same day sync. I don't know if that's true
[00:02:10] Marcus (Invoca CSM): got it. anything else on the signal side?
[00:02:14] Dana (Brightline): the spam thing. signal AI is tagging like, half our after hours calls as spam, and they're real people, they're booking jobs
[00:02:40] Dana (Brightline): oh and renewal, finance is asking why presense is an add on. it kinda feels like we're paying twice
[00:03:05] Marcus (Invoca CSM): fair. how's the team liking the new call summaries?
[00:03:08] Dana (Brightline): oh those are great actually, the dispatchers love them`;

const schema = {
  type: 'object', additionalProperties: false, required: ['insights'],
  properties: { insights: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['type', 'summary', 'product_area', 'severity', 'evidence_quote', 'confidence'],
    properties: {
      type: { type: 'string', enum: ['feature_request', 'bug', 'pricing_objection', 'competitor_mention', 'churn_risk', 'praise'] },
      summary: { type: 'string' }, product_area: { type: 'string' },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      evidence_quote: { type: 'string' }, confidence: { type: 'number' },
    } } } },
};

async function run(model: string) {
  const t0 = performance.now();
  let ttft = 0, text = '', cost = 0;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', 'x-title': 'Signal Loop speed test' },
    body: JSON.stringify({
      model, stream: true, ...(/haiku|kimi/.test(model) ? {} : { temperature: 0 }), max_tokens: 1500, usage: { include: true }, reasoning: { enabled: false },
      provider: { data_collection: 'deny', require_parameters: true, sort: 'throughput' },
      response_format: { type: 'json_schema', json_schema: { name: 'insights', strict: true, schema } },
      messages: [
        { role: 'system', content: 'Extract customer feedback insights from the call. Every insight needs a verbatim evidence_quote copied exactly from the transcript. Return JSON only.' },
        { role: 'user', content: `<transcript>\n${transcript}\n</transcript>` },
      ],
    }),
  });
  if (!res.ok || !res.body) return { error: `${res.status} ${(await res.text()).slice(0, 160)}` };
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
      try {
        const j = JSON.parse(line.slice(5));
        const d = j.choices?.[0]?.delta?.content; if (d) { if (!ttft) ttft = performance.now() - t0; text += d; }
        if (j.usage?.cost) cost = j.usage.cost;
      } catch { /* keep-alive comments */ }
    }
  }
  const total = performance.now() - t0;
  let n = -1, grounded = 0;
  try { const o = JSON.parse(text.replace(/^```json|```$/g, '')); n = o.insights.length; grounded = o.insights.filter((x: { evidence_quote: string }) => transcript.includes(x.evidence_quote)).length; } catch { /* invalid */ }
  return { ttft, total, n, grounded, cost };
}

for (const m of MODELS) {
  const rows = [];
  for (let r = 0; r < RUNS; r++) rows.push(await run(m));
  const ok = rows.filter((r) => !('error' in r)) as { ttft: number; total: number; n: number; grounded: number; cost: number }[];
  const med = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? NaN;
  console.log(`${m.padEnd(30)} ok ${ok.length}/${RUNS}  ttft ${med(ok.map((r) => r.ttft)).toFixed(0)}ms  total ${med(ok.map((r) => r.total)).toFixed(0)}ms  insights ${ok.map((r) => `${r.grounded}/${r.n}`).join(',')}  cost $${ok.reduce((s, r) => s + r.cost, 0).toFixed(4)}`);
  for (const r of rows) if ('error' in r) console.log('   error:', r.error);
}
