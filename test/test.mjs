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

// ----- end to end, with a real SQLite database standing in for D1 -----
import { DatabaseSync } from 'node:sqlite';
const sql = new DatabaseSync(':memory:');
const stmt = (q, args = []) => ({
  bind(...a) { return stmt(q, a.map((v) => (v === undefined ? null : v))); },
  async first() { return sql.prepare(q).get(...args) ?? null; },
  async all() { return { results: sql.prepare(q).all(...args) }; },
  async run() { sql.prepare(q).run(...args); return {}; },
});
const DB = { prepare: (q) => stmt(q), async batch(list) { for (const x of list) await x.run(); return []; } };
const env = { ASSETS: { fetch: async () => new Response('asset') }, DB, ANTHROPIC_API_KEY: 'k' };
const call = async (path, { method, body, token, origin } = {}) => {
  const headers = {}; if (token) headers.authorization = 'Bearer ' + token; if (origin) headers.origin = origin;
  const r = await worker.fetch(new Request('https://x.test/api/' + path, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined }), env);
  return { status: r.status, d: await r.json() };
};
// the AI is faked
let aiCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => { if (String(u).includes('anthropic')) { aiCalls++; return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ruling":"Runner is out on appeal.","confidence":"high","umpireCall":"","explanation":"e","rules":[],"questions":[]}' }], stop_reason: 'end_turn' })); } throw new Error('unexpected fetch ' + u); };

assert.equal(await (await worker.fetch(new Request('https://x.test/'), env)).text(), 'asset');
assert.deepEqual((await call('config')).d, { free: 3, billing: false, reset: false, month: 'Monthly', year: '' });
assert.equal((await call('me')).status, 401);
assert.equal((await call('me', { token: 'f'.repeat(64) })).status, 401);
assert.equal((await call('signup', { body: { email: 'bad', password: 'longenough' } })).status, 400);
assert.equal((await call('signup', { body: { email: 'a@b.co', password: 'short' } })).status, 400);
const su = await call('signup', { body: { email: ' Coach@Example.com ', password: 'longenough' } });
assert.equal(su.status, 200); assert.equal(su.d.email, 'coach@example.com'); const tok = su.d.token;
assert.equal((await call('signup', { body: { email: 'coach@example.com', password: 'longenough' } })).status, 409);
assert.equal((await call('signin', { body: { email: 'coach@example.com', password: 'wrongwrong' } })).status, 401);
assert.equal((await call('signin', { body: { email: 'nobody@example.com', password: 'wrongwrong' } })).status, 401);
const si = await call('signin', { body: { email: 'coach@example.com', password: 'longenough' } });
assert.equal(si.status, 200);
assert.equal(sql.prepare('SELECT pw_hash FROM users').get().pw_hash.length, 64);
assert.equal((await call('ask', { body: {}, token: tok, origin: 'https://evil.test' })).status, 403);
assert.equal((await call('me', { token: tok })).d.me.left, 3);
const play = { sport: 'baseball', org: 'tl', age: '8U', pitch: 'coach', q: 'Runner on first left early on a caught fly ball and the ball was thrown back.' };
assert.equal((await call('ask', { body: { ...play, q: 'short' }, token: tok })).status, 400);
assert.equal((await call('ask', { body: { ...play, sport: 'football' }, token: tok })).status, 400);
let last;
for (let i = 0; i < 3; i++) { last = await call('ask', { body: play, token: tok }); assert.equal(last.status, 200); }
assert.equal(last.d.me.left, 0); assert.equal(last.d.ruling.division, '8U, coach pitch division');
const over = await call('ask', { body: play, token: tok }); assert.equal(over.status, 402); assert.equal(aiCalls, 3);
const list = await call('rulings', { token: tok }); assert.equal(list.d.rulings.length, 3); assert.equal(list.d.rulings[0].answer.ruling, 'Runner is out on appeal.');
// someone else can't see or delete them
const other = (await call('signup', { body: { email: 'other@example.com', password: 'longenough' } })).d.token;
assert.equal((await call('rulings', { token: other })).d.rulings.length, 0);
await call('rulings/' + list.d.rulings[0].id, { method: 'DELETE', token: other });
assert.equal((await call('rulings', { token: tok })).d.rulings.length, 3);
await call('rulings/' + list.d.rulings[0].id, { method: 'DELETE', token: tok });
assert.equal((await call('rulings', { token: tok })).d.rulings.length, 2);
// comp account and subscriber are unlimited
env.COMP_EMAILS = 'Other@example.com';
assert.equal((await call('me', { token: other })).d.me.plan, 'comp');
sql.prepare("UPDATE users SET sub_status='active' WHERE email='coach@example.com'").run();
assert.equal((await call('ask', { body: play, token: tok })).status, 200);
assert.equal((await call('delete-account', { body: {}, token: tok })).status, 400); // subscribed
sql.prepare("UPDATE users SET sub_status='canceled' WHERE email='coach@example.com'").run();
// reset is off without a mail key; sign out kills the session
assert.equal((await call('reset-start', { body: { email: 'coach@example.com' } })).status, 503);
await call('signout', { body: {}, token: si.d.token }); assert.equal((await call('me', { token: si.d.token })).status, 401);
// deleting and signing up again doesn't hand out more free rulings
assert.equal((await call('delete-account', { body: {}, token: tok })).status, 200);
assert.equal((await call('me', { token: tok })).status, 401);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM rulings').get().n, 0);
const again = (await call('signup', { body: { email: 'coach@example.com', password: 'longenough' } })).d.token;
assert.equal((await call('me', { token: again })).d.me.left, 0);
// lockout after repeated wrong passwords
for (let i = 0; i < 8; i++) await call('signin', { body: { email: 'other@example.com', password: 'nope-nope' } });
assert.equal((await call('signin', { body: { email: 'other@example.com', password: 'longenough' } })).status, 429);
// password reset with a mail key
env.RESEND_API_KEY = 'r'; env.MAIL_FROM = 'x@y.z'; let mail = '';
globalThis.fetch = async (u, o) => { if (String(u).includes('resend')) { mail = JSON.parse(o.body).text; return new Response('{}'); } throw new Error('unexpected'); };
assert.equal((await call('reset-start', { body: { email: 'ghost@example.com' } })).status, 200); assert.equal(mail, '');
await call('reset-start', { body: { email: 'other@example.com' } });
const code = /\d{6}/.exec(mail)[0];
assert.equal((await call('reset-finish', { body: { email: 'other@example.com', code: '000000' === code ? '111111' : '000000', password: 'brandnewpass' } })).status, 400);
assert.equal((await call('reset-finish', { body: { email: 'other@example.com', code, password: 'brandnewpass' } })).status, 200);
assert.equal((await call('me', { token: other })).status, 401); // old sessions ended
assert.equal((await call('signin', { body: { email: 'other@example.com', password: 'brandnewpass' } })).status, 200);
assert.equal((await call('reset-finish', { body: { email: 'other@example.com', code, password: 'another-pass' } })).status, 400); // code is single use
globalThis.fetch = realFetch;
assert.equal((await worker.fetch(new Request('https://x.test/api/stripe-webhook', { method: 'POST', body: '{}' }), { ...env, STRIPE_WEBHOOK_SECRET: 's' })).status, 400);
assert(SPORTS.filter((s) => s.live).every((s) => ENGINES[s.id] && ASK[s.id]));
console.log('all tests passed');
