import assert from 'node:assert';
import worker, { repair, stripeSigned } from '../src/worker.js';
import { ENGINES } from '../src/sports/index.js';
import { SPORTS, ASK } from '../public/sports.js';
import { createHmac } from 'node:crypto';

// prompts build for every org / age
const e = ENGINES.baseball;
for (const org of ASK.baseball.orgs) for (const age of ['', ...ASK.baseball.ages]) {
  const c = e.clean({ org, age, pitch: 'coach' });
  const p = e.buildPrompt(c, 'Runner on first leaves early on a caught fly ball.', 'Safe');
  assert(p.includes('<situation>') && p.length < 40000, org + age);
  assert(!p.includes('undefined'), 'undefined in prompt ' + org + age);
}
assert.equal(e.clean({ org: 'x', age: '14U', pitch: 'coach' }).pitch, '');
assert.equal(e.division(e.clean({ org: 'tl', age: '8U', pitch: 'coach' })), '8U, coach pitch division');

// repair
const good = repair('Here: {"ruling":"Out.","confidence":"high","umpireCall":"right","explanation":"x","rules":[{"source":"NFHS 8-4","text":"t","fromSummary":false}],"questions":["a"],}');
assert.equal(good.ruling, 'Out.'); assert.equal(good.rules[0].fromSummary, false);
const cut = repair('{"ruling": "Runner is out.", "confidence": "medium", "explanation": "Because');
assert.equal(cut.ruling, 'Runner is out.'); assert.equal(cut.cut, true);
assert.equal(repair('nope'), null);
assert.equal(repair('{"ruling":"x","confidence":"<b>"}').confidence, '');

// stripe signature
const t = Math.floor(Date.now() / 1000), raw = '{"a":1}';
const sig = createHmac('sha256', 'whsec').update(t + '.' + raw).digest('hex');
assert.equal(await stripeSigned(raw, `t=${t},v1=${sig}`, 'whsec'), true);
assert.equal(await stripeSigned(raw, `t=${t},v1=${sig}`, 'other'), false);
assert.equal(await stripeSigned(raw, `t=${t - 900},v1=${sig}`, 'whsec'), false);

// routes
const env = { ASSETS: { fetch: async () => new Response('asset') } };
assert.equal(await (await worker.fetch(new Request('https://x.test/'), env)).text(), 'asset');
const cfg = await (await worker.fetch(new Request('https://x.test/api/config'), env)).json();
assert.deepEqual(cfg, { free: 3, billing: false, month: 'Monthly', year: '' });
assert.equal((await worker.fetch(new Request('https://x.test/api/me'), env)).status, 500); // no DB
const db = { batch: async () => [], prepare: () => ({ bind() { return this; }, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }) };
assert.equal((await worker.fetch(new Request('https://x.test/api/me'), { ...env, DB: db })).status, 401);
assert.equal((await worker.fetch(new Request('https://x.test/api/ask', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' }), { ...env, DB: db })).status, 403);
assert.equal((await worker.fetch(new Request('https://x.test/api/stripe-webhook', { method: 'POST', body: '{}' }), { ...env, DB: db, STRIPE_WEBHOOK_SECRET: 's' })).status, 400);
assert(SPORTS.filter((s) => s.live).every((s) => ENGINES[s.id] && ASK[s.id]));
console.log('all tests passed');
