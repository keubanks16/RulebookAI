// The Rulebook AI: Cloudflare Worker.
//
// Serves the app (the public/ folder) and answers everything under /api/.
// Secret keys live here on Cloudflare, never in the app.
//
// Settings -> Variables and Secrets:
//   ANTHROPIC_API_KEY      Secret  REQUIRED. Your key from console.anthropic.com.
//   COMP_EMAILS            Text    optional; comma-separated sign-in emails that get unlimited rulings free (you).
//   FREE_RULINGS           Text    optional; free rulings per account before subscribing. Default 3.
//   DAILY_CAP              Text    optional; most rulings one account can ask in 24 hours. Default 40.
//   MODEL                  Text    optional; defaults to claude-sonnet-5-5.
//   Password reset emails (optional). Until these are set, "Forgot password" tells people to contact you:
//   RESEND_API_KEY         Secret  an API key from resend.com.
//   MAIL_FROM              Text    the sender, e.g. The Rulebook AI <help@yourdomain.com> (a domain verified in Resend).
//   Subscriptions (Stripe). Until these are set the app says subscriptions are coming soon:
//   STRIPE_SECRET_KEY      Secret  Stripe -> Developers -> API keys -> Secret key.
//   STRIPE_WEBHOOK_SECRET  Secret  Stripe -> Developers -> Webhooks -> your endpoint -> Signing secret.
//                                  Endpoint address: https://<your-site>/api/stripe-webhook
//                                  Events: checkout.session.completed, customer.subscription.created,
//                                          customer.subscription.updated, customer.subscription.deleted
//   STRIPE_PRICE_MONTH     Text    the monthly price ID (price_...).
//   STRIPE_PRICE_YEAR      Text    optional; the yearly price ID.
//   PRICE_LABEL_MONTH      Text    optional; what the button says, e.g. "$4.99 / month".
//   PRICE_LABEL_YEAR       Text    optional; e.g. "$39.99 / year".
// Bindings (already in wrangler.jsonc): DB = the D1 database, ASSETS = the public/ folder.

import { ENGINES } from './sports/index.js';
import { SPORTS } from '../public/sports.js';

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const SESSION_DAYS = 90, PW_ITER = 100000;
const MAX_Q = 2000, MAX_CALL = 500, MAX_TOKENS = 3000, HISTORY = 60;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (e) {
      if (e && e.status) return json(e.status, { error: e.error, detail: e.detail || '' });
      return json(500, { error: 'server', detail: 'Something went wrong. Try again.' });
    }
  }
};

const fail = (status, error, detail) => Object.assign(new Error(error), { status, error, detail });

async function api(request, env, url) {
  const path = url.pathname.slice(5), method = request.method;
  if (path === 'stripe-webhook' && method === 'POST') return stripeWebhook(request, env);
  if (path === 'config' && method === 'GET') return json(200, config(env));

  // Requests that change something must come from this site.
  if (method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) throw fail(403, 'origin', 'Wrong site.');
  }
  if (!env.DB) throw fail(500, 'not_configured', 'The database (DB) is not connected to the Worker.');
  await ready(env);
  if (AUTH_PATHS.includes(path)) {
    if (method !== 'POST') throw fail(405, 'bad_request', 'Use POST.');
    const b = await request.json().catch(() => null);
    if (!b || typeof b !== 'object') throw fail(400, 'bad_request', '');
    return authTask(path, b, env, request);
  }
  const user = await signedIn(request, env);

  if (path === 'me' && method === 'GET') return json(200, { me: await meOf(env, user) });
  if (path === 'rulings' && method === 'GET') {
    const q = await env.DB.prepare('SELECT id, at, sport, org, division, q, call, answer FROM rulings WHERE uid = ? ORDER BY at DESC LIMIT ?').bind(user.uid, HISTORY).all();
    return json(200, { rulings: (q.results || []).map(rowOut) });
  }
  if (path.startsWith('rulings/') && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM rulings WHERE id = ? AND uid = ?').bind(path.slice(8), user.uid).run();
    return json(200, { ok: true });
  }
  if (method !== 'POST') throw fail(405, 'bad_request', 'Use POST.');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw fail(400, 'bad_request', '');
  if (path === 'ask') return ask(env, user, body);
  if (path === 'checkout') return checkout(env, user, body, url.origin);
  if (path === 'portal') return portal(env, user, url.origin);
  if (path === 'signout') return signOutTask(env, request);
  if (path === 'delete-account') return deleteAccount(env, user);
  throw fail(404, 'bad_request', 'Unknown request.');
}

function config(env) {
  return {
    free: num(env.FREE_RULINGS, 3),
    billing: !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTH),
    reset: !!(env.RESEND_API_KEY && env.MAIL_FROM),
    month: env.PRICE_LABEL_MONTH || 'Monthly',
    year: env.STRIPE_PRICE_YEAR ? (env.PRICE_LABEL_YEAR || 'Yearly') : '',
  };
}

// ---------- Database ----------
let READY = false;
async function ready(env) {
  if (READY) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pw_salt TEXT, pw_hash TEXT, fails INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, reset_hash TEXT, reset_exp INTEGER, reset_tries INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, stripe_customer TEXT, stripe_sub TEXT, sub_status TEXT, period_end INTEGER, created INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, uid TEXT NOT NULL, exp INTEGER NOT NULL)'),
    // Free rulings already used by an email, kept (as a hash) after an account is deleted so deleting doesn't reset the free count.
    env.DB.prepare('CREATE TABLE IF NOT EXISTS spent (email_hash TEXT PRIMARY KEY, used INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rulings (id TEXT PRIMARY KEY, uid TEXT NOT NULL, at INTEGER NOT NULL, sport TEXT, org TEXT, division TEXT, q TEXT, call TEXT, answer TEXT)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS rulings_uid_at ON rulings (uid, at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS users_customer ON users (stripe_customer)'),
  ]);
  READY = true;
}
const isComp = (env, u) => !!u.email && String(env.COMP_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(String(u.email).toLowerCase());
const isPro = (u) => ['active', 'trialing'].includes(u.sub_status || '');
async function meOf(env, u) {
  const free = num(env.FREE_RULINGS, 3), comp = isComp(env, u), pro = isPro(u);
  return { email: u.email || '', plan: comp ? 'comp' : pro ? 'pro' : 'free', used: u.used, free, left: comp || pro ? null : Math.max(0, free - u.used), renews: pro && u.period_end ? u.period_end : null, canManage: !!u.stripe_customer };
}
function rowOut(r) {
  let answer = {};
  try { answer = JSON.parse(r.answer || '{}'); } catch (e) { /* keep empty */ }
  return { id: r.id, at: r.at, sport: r.sport, org: r.org, division: r.division, q: r.q, call: r.call || '', answer };
}

// ---------- Asking for a ruling ----------
async function ask(env, user, body) {
  if (!env.ANTHROPIC_API_KEY) throw fail(500, 'not_configured', 'The AI key has not been added yet.');
  const sport = SPORTS.find((s) => s.id === body.sport && s.live);
  const engine = sport && ENGINES[sport.id];
  if (!engine) throw fail(400, 'bad_sport', 'That sport isn’t available yet.');
  const q = String(body.q || '').trim(), call = String(body.call || '').trim();
  if (q.length < 15) throw fail(400, 'too_short', 'Describe the play in a sentence or two.');
  if (q.length > MAX_Q || call.length > MAX_CALL) throw fail(400, 'too_long', 'That’s too long. Keep the play under ' + MAX_Q + ' characters.');

  const comp = isComp(env, user), pro = isPro(user), free = num(env.FREE_RULINGS, 3);
  if (!comp && !pro && user.used >= free) throw fail(402, 'limit', 'You’ve used your free rulings.');
  const day = await env.DB.prepare('SELECT COUNT(*) AS n FROM rulings WHERE uid = ? AND at > ?').bind(user.uid, Date.now() - 86400000).first();
  if (!comp && day && day.n >= num(env.DAILY_CAP, 40)) throw fail(429, 'daily_cap', 'You’ve hit today’s limit. Try again tomorrow.');

  const c = engine.clean(body);
  const prompt = engine.buildPrompt(c, q.replace(/<\/?(situation|umpire_call)>/gi, ''), call.replace(/<\/?(situation|umpire_call)>/gi, ''));
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env.MODEL || DEFAULT_MODEL, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] })
    });
  } catch (e) { throw fail(502, 'upstream', 'Couldn’t reach the AI. Try again.'); }
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 429 || r.status === 529) throw fail(429, 'busy', 'The AI is busy. Try again in a minute.');
    throw fail(502, 'upstream', 'The AI couldn’t answer right now. Try again.');
  }
  const text = ((data && data.content) || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const answer = repair(text);
  if (!answer || !answer.ruling) throw fail(502, 'no_answer', 'No ruling came back. Try again; this one didn’t count.');
  if (data && data.stop_reason === 'max_tokens') answer.cut = true;

  const row = { id: crypto.randomUUID(), at: Date.now(), sport: sport.id, org: c.org, division: engine.division(c), q, call, answer };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO rulings (id, uid, at, sport, org, division, q, call, answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(row.id, user.uid, row.at, row.sport, row.org, row.division, q, call, JSON.stringify(answer)),
    env.DB.prepare('UPDATE users SET used = used + 1 WHERE uid = ?').bind(user.uid),
  ]);
  user.used += 1;
  return json(200, { ruling: row, me: await meOf(env, user) });
}

// The AI sometimes wraps JSON in text, breaks a string across lines, or leaves a trailing comma.
export function repair(raw) {
  const t = String(raw || '');
  const a = t.indexOf('{'), z = t.lastIndexOf('}');
  let o = null;
  if (a >= 0 && z > a) {
    const body = t.slice(a, z + 1);
    const tries = [body, body.replace(/[\u0000-\u001f]+/g, ' '), body.replace(/[\u0000-\u001f]+/g, ' ').replace(/,\s*([}\]])/g, '$1')];
    for (const x of tries) { try { const p = JSON.parse(x); if (p && typeof p === 'object') { o = p; break; } } catch (e) { /* next */ } }
  }
  if (!o) {
    // Cut off mid-answer: pull out whatever fields finished.
    const str = (k) => { const m = new RegExp('"' + k + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"').exec(t); try { return m ? JSON.parse('"' + m[1] + '"') : ''; } catch (e) { return ''; } };
    const ruling = str('ruling');
    if (!ruling) return null;
    const rules = [];
    const re = /\{\s*"source"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m; while ((m = re.exec(t)) && rules.length < 5) { try { rules.push({ source: JSON.parse('"' + m[1] + '"'), text: JSON.parse('"' + m[2] + '"'), fromSummary: true }); } catch (e) { /* skip */ } }
    o = { ruling, confidence: str('confidence'), umpireCall: str('umpireCall'), explanation: str('explanation'), assumes: str('assumes'), askUmpire: str('askUmpire'), rules, cut: true };
  }
  // Keep only the fields the app shows, as plain text of a sensible size.
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  return {
    ruling: s(o.ruling, 600),
    confidence: ['high', 'medium', 'low'].includes(o.confidence) ? o.confidence : '',
    umpireCall: ['right', 'wrong', 'judgment'].includes(o.umpireCall) ? o.umpireCall : '',
    explanation: s(o.explanation, 1500),
    rules: (Array.isArray(o.rules) ? o.rules : []).slice(0, 5).filter((r) => r && typeof r === 'object').map((r) => ({ source: s(r.source, 120), text: s(r.text, 400), fromSummary: r.fromSummary !== false })),
    assumes: s(o.assumes, 600),
    questions: (Array.isArray(o.questions) ? o.questions : []).slice(0, 4).map((x) => s(x, 200)).filter(Boolean),
    askUmpire: s(o.askUmpire, 400),
    cut: !!o.cut,
  };
}

// ---------- Accounts (The Rulebook AI's own; nothing shared with other apps) ----------
const AUTH_PATHS = ['signup', 'signin', 'reset-start', 'reset-finish'];
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async (t) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))));
async function pwHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: PW_ITER }, key, 256));
}
function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  if (e.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw fail(400, 'bad_email', 'That email doesn’t look right.');
  return e;
}
function cleanPassword(v) {
  const p = String(v || '');
  if (p.length < 8) throw fail(400, 'weak_password', 'Use a password with at least 8 characters.');
  if (p.length > 200) throw fail(400, 'weak_password', 'That password is too long.');
  return p;
}
async function newSession(env, uid) {
  const token = rand(32);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE exp < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO sessions (token_hash, uid, exp) VALUES (?, ?, ?)').bind(await sha(token), uid, Date.now() + SESSION_DAYS * 86400000),
  ]);
  return token;
}
async function authTask(path, b, env) {
  const email = cleanEmail(b.email);
  const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

  if (path === 'signup') {
    const password = cleanPassword(b.password);
    if (u) throw fail(409, 'exists', 'That email already has an account. Sign in instead.');
    const uid = crypto.randomUUID(), salt = rand(16);
    const before = await env.DB.prepare('SELECT used FROM spent WHERE email_hash = ?').bind(await sha(email)).first();
    await env.DB.prepare('INSERT INTO users (uid, email, pw_salt, pw_hash, used, created) VALUES (?, ?, ?, ?, ?, ?)').bind(uid, email, salt, await pwHash(password, salt), before ? before.used : 0, Date.now()).run();
    return json(200, { token: await newSession(env, uid), email });
  }
  if (path === 'signin') {
    const password = String(b.password || '').slice(0, 200);
    if (u && u.lock_until > Date.now()) throw fail(429, 'locked', 'Too many tries. Wait a few minutes.');
    const ok = !!u && same(await pwHash(password, u.pw_salt), u.pw_hash);
    if (!ok) {
      if (u) { const fails = u.fails + 1; await env.DB.prepare('UPDATE users SET fails = ?, lock_until = ? WHERE uid = ?').bind(fails >= 8 ? 0 : fails, fails >= 8 ? Date.now() + 600000 : null, u.uid).run(); }
      throw fail(401, 'bad_login', 'Email or password is wrong.');
    }
    if (u.fails) await env.DB.prepare('UPDATE users SET fails = 0, lock_until = NULL WHERE uid = ?').bind(u.uid).run();
    return json(200, { token: await newSession(env, u.uid), email });
  }
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw fail(503, 'reset_off', 'Password reset by email isn’t set up yet.');
  if (path === 'reset-start') {
    // Same reply whether or not the email has an account.
    if (u && !(u.reset_exp > Date.now() + 14 * 60000)) {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
      await env.DB.prepare('UPDATE users SET reset_hash = ?, reset_exp = ?, reset_tries = 0 WHERE uid = ?').bind(await sha(u.uid + ':' + code), Date.now() + 15 * 60000, u.uid).run();
      await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject: 'Your Rulebook AI reset code', text: 'Your password reset code is ' + code + '. It works for 15 minutes. If you didn’t ask for this, ignore this email.' }) }).catch(() => {});
    }
    return json(200, { ok: true });
  }
  // reset-finish
  const password = cleanPassword(b.password), code = String(b.code || '').trim();
  const bad = fail(400, 'bad_code', 'That code is wrong or expired. Ask for a new one.');
  if (!u || !u.reset_hash || !(u.reset_exp > Date.now()) || u.reset_tries >= 5) throw bad;
  if (!same(await sha(u.uid + ':' + code), u.reset_hash)) { await env.DB.prepare('UPDATE users SET reset_tries = reset_tries + 1 WHERE uid = ?').bind(u.uid).run(); throw bad; }
  const salt = rand(16);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pw_salt = ?, pw_hash = ?, reset_hash = NULL, reset_exp = NULL, fails = 0, lock_until = NULL WHERE uid = ?').bind(salt, await pwHash(password, salt), u.uid),
    env.DB.prepare('DELETE FROM sessions WHERE uid = ?').bind(u.uid),
  ]);
  return json(200, { token: await newSession(env, u.uid), email });
}
const bearer = (request) => { const m = /^Bearer\s+([0-9a-f]{64})$/.exec(request.headers.get('authorization') || ''); return m ? m[1] : ''; };
async function signedIn(request, env) {
  const t = bearer(request);
  const u = t && await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.uid = s.uid WHERE s.token_hash = ? AND s.exp > ?').bind(await sha(t), Date.now()).first();
  if (!u) throw fail(401, 'sign_in', 'Sign in to continue.');
  return u;
}
async function signOutTask(env, request) {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha(bearer(request))).run();
  return json(200, { ok: true });
}

// ---------- Subscriptions (Stripe) ----------
async function stripe(env, path, params) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: params ? 'POST' : 'GET',
    headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, 'content-type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params).toString() : undefined
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw fail(502, 'billing', 'Couldn’t reach billing. Try again.');
  return d;
}
async function checkout(env, user, body, origin) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_MONTH) throw fail(503, 'billing_off', 'Subscriptions aren’t open yet.');
  if (isPro(user)) throw fail(400, 'already', 'You’re already subscribed.');
  const price = body.period === 'year' && env.STRIPE_PRICE_YEAR ? env.STRIPE_PRICE_YEAR : env.STRIPE_PRICE_MONTH;
  const p = {
    mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1',
    client_reference_id: user.uid, 'subscription_data[metadata][uid]': user.uid,
    success_url: origin + '/?subscribed=1', cancel_url: origin + '/?tab=account',
  };
  if (user.stripe_customer) p.customer = user.stripe_customer; else if (user.email) p.customer_email = user.email;
  const s = await stripe(env, 'checkout/sessions', p);
  return json(200, { url: s.url });
}
async function portal(env, user, origin) {
  if (!env.STRIPE_SECRET_KEY || !user.stripe_customer) throw fail(400, 'billing_off', 'No subscription to manage.');
  const s = await stripe(env, 'billing_portal/sessions', { customer: user.stripe_customer, return_url: origin + '/?tab=account' });
  return json(200, { url: s.url });
}
// Deletes the account: sign-in, sessions and saved rulings.
async function deleteAccount(env, user) {
  if (isPro(user)) throw fail(400, 'subscribed', 'Cancel your subscription first (Manage subscription), then delete your account.');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO spent (email_hash, used) VALUES (?, ?) ON CONFLICT(email_hash) DO UPDATE SET used = MAX(used, excluded.used)').bind(await sha(user.email), user.used),
    env.DB.prepare('DELETE FROM rulings WHERE uid = ?').bind(user.uid),
    env.DB.prepare('DELETE FROM sessions WHERE uid = ?').bind(user.uid),
    env.DB.prepare('DELETE FROM users WHERE uid = ?').bind(user.uid),
  ]);
  return json(200, { ok: true });
}
async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.DB) return json(503, { error: 'billing_off' });
  const raw = await request.text();
  if (!(await stripeSigned(raw, request.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET))) return json(400, { error: 'bad_signature' });
  let ev;
  try { ev = JSON.parse(raw); } catch (e) { return json(400, { error: 'bad_request' }); }
  const o = ev && ev.data && ev.data.object;
  if (!o) return json(200, { ok: true });
  await ready(env);
  if (ev.type === 'checkout.session.completed' && o.mode === 'subscription' && o.client_reference_id) {
    await env.DB.prepare('UPDATE users SET stripe_customer = ?, stripe_sub = ?, sub_status = ? WHERE uid = ?')
      .bind(String(o.customer || ''), String(o.subscription || ''), 'active', String(o.client_reference_id)).run();
  } else if (/^customer\.subscription\.(created|updated|deleted)$/.test(ev.type || '')) {
    const status = ev.type.endsWith('deleted') ? 'canceled' : String(o.status || '');
    const item = o.items && o.items.data && o.items.data[0];
    const end = (o.current_period_end || (item && item.current_period_end) || 0) * 1000 || null;
    const uid = o.metadata && o.metadata.uid;
    if (uid) await env.DB.prepare('UPDATE users SET stripe_customer = ?, stripe_sub = ?, sub_status = ?, period_end = ? WHERE uid = ?').bind(String(o.customer || ''), String(o.id || ''), status, end, String(uid)).run();
    else await env.DB.prepare('UPDATE users SET stripe_sub = ?, sub_status = ?, period_end = ? WHERE stripe_customer = ?').bind(String(o.id || ''), status, end, String(o.customer || '')).run();
  }
  return json(200, { ok: true });
}
export async function stripeSigned(raw, header, secret) {
  const parts = Object.create(null);
  for (const kv of header.split(',')) { const i = kv.indexOf('='); if (i > 0) (parts[kv.slice(0, i).trim()] = parts[kv.slice(0, i).trim()] || []).push(kv.slice(i + 1).trim()); }
  const t = parts.t && parts.t[0];
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = (await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + raw)));
  const mac = hex(sig);
  return parts.v1.some((v) => same(v, mac));
}
function same(a, b) { a = String(a || ''); b = String(b || ''); if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
