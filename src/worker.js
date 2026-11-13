// The Rulebook AI: Cloudflare Worker.
//
// Serves the app (the public/ folder) and answers everything under /api/.
// Secret keys live here on Cloudflare, never in the app.
//
// Settings -> Variables and Secrets:
//   ANTHROPIC_API_KEY      Secret  REQUIRED. Your key from console.anthropic.com.
//   COMP_EMAILS            Text    optional; comma-separated sign-in emails that get unlimited rulings free (you).
//   ADMIN_EMAILS           Text    optional; who can read rule suggestions in the app. Defaults to COMP_EMAILS.
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
//   iPhone app subscriptions (Apple in-app purchases; see APP_STORE.md):
//   APPLE_BUNDLE_ID        Text    the iPhone app's bundle ID, e.g. com.kollinmeubanks.rulebookai
//   APPLE_ISSUER_ID        Text    App Store Connect -> Users and Access -> Integrations -> In-App Purchase -> Issuer ID
//   APPLE_KEY_ID           Text    the In-App Purchase key's Key ID
//   APPLE_PRIVATE_KEY      Secret  the whole .p8 file of that In-App Purchase key
//   APPLE_PRODUCT_MONTH, APPLE_PRODUCT_YEAR  Text  optional; product IDs default to <bundle id>.monthly and .yearly
//   APPLE_SANDBOX          Text    optional; "off" = TestFlight/sandbox purchases don't turn subscriptions on
//   App Store Server Notifications V2 address to give Apple: https://<your-site>/api/apple-notifications
// Bindings (already in wrangler.jsonc): DB = the D1 database, ASSETS = the public/ folder.

import { ENGINES } from './sports/index.js';
import { SPORTS } from '../public/sports.js';

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const SESSION_DAYS = 90, PW_ITER = 100000;
const APP_ORIGINS = ['capacitor://localhost', 'https://localhost'];
const MAX_Q = 2000, MAX_CALL = 500, MAX_TOKENS = 3000, HISTORY = 60;

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    // The iPhone app loads from capacitor://localhost and calls this API across origins.
    const origin = request.headers.get('origin') || '';
    const cors = APP_ORIGINS.includes(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, authorization', 'access-control-max-age': '86400', vary: 'Origin' } : null;
    if (request.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    let res;
    try {
      res = await api(request, env, url);
    } catch (e) {
      if (e && e.status) res = json(e.status, { error: e.error, detail: e.detail || '' });
      else res = json(500, { error: 'server', detail: 'Something went wrong. Try again.' });
    }
    if (cors) for (const k in cors) res.headers.set(k, cors[k]);
    return res;
  }
};

const fail = (status, error, detail) => Object.assign(new Error(error), { status, error, detail });

async function api(request, env, url) {
  const path = url.pathname.slice(5), method = request.method;
  if (path === 'stripe-webhook' && method === 'POST') return stripeWebhook(request, env);
  if (path === 'apple-notifications' && method === 'POST') return appleNotification(request, env);
  if (path === 'config' && method === 'GET') return json(200, config(env));

  // Requests that change something must come from this site.
  if (method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin && !APP_ORIGINS.includes(origin)) throw fail(403, 'origin', 'Wrong site.');
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
  if (path === 'suggestions' && method === 'GET') {
    if (!isAdmin(env, user)) throw fail(403, 'not_allowed', 'Only the app’s owner can see suggestions.');
    const q = await env.DB.prepare('SELECT id, at, email, name, link, notes FROM suggestions ORDER BY at DESC LIMIT 200').all();
    return json(200, { suggestions: q.results || [] });
  }
  if (path.startsWith('suggestions/') && method === 'DELETE') {
    if (!isAdmin(env, user)) throw fail(403, 'not_allowed', '');
    await env.DB.prepare('DELETE FROM suggestions WHERE id = ?').bind(path.slice(12)).run();
    return json(200, { ok: true });
  }
  if (path.startsWith('rulings/') && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM rulings WHERE id = ? AND uid = ?').bind(path.slice(8), user.uid).run();
    return json(200, { ok: true });
  }
  if (method !== 'POST') throw fail(405, 'bad_request', 'Use POST.');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw fail(400, 'bad_request', '');
  if (path === 'ask') return ask(env, user, body);
  if (path === 'suggest') return suggest(env, user, body);
  if (path === 'checkout') return checkout(env, user, body, url.origin);
  if (path === 'portal') return portal(env, user, url.origin);
  if (path === 'iap-info') return json(200, { appAccountToken: user.uid, products: appleProducts(env) });
  if (path === 'iap-link') return iapLink(env, user, body);
  if (path === 'signout') return signOutTask(env, request);
  if (path === 'delete-account') return deleteAccount(env, user);
  throw fail(404, 'bad_request', 'Unknown request.');
}

function config(env) {
  return {
    free: num(env.FREE_RULINGS, 3),
    billing: !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTH),
    reset: !!(env.RESEND_API_KEY && env.MAIL_FROM),
    apple: appleReady(env),
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
    env.DB.prepare('CREATE TABLE IF NOT EXISTS suggestions (id TEXT PRIMARY KEY, uid TEXT, email TEXT, at INTEGER NOT NULL, name TEXT, link TEXT, notes TEXT)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS users_customer ON users (stripe_customer)'),
  ]);
  // Columns added after the first version. "duplicate column" just means it's already there.
  for (const col of ['store TEXT', 'apple_otid TEXT']) { try { await env.DB.prepare('ALTER TABLE users ADD COLUMN ' + col).run(); } catch (e) { /* already added */ } }
  READY = true;
}
const isComp = (env, u) => !!u.email && String(env.COMP_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(String(u.email).toLowerCase());
const inList = (list, email) => !!email && String(list || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean).includes(String(email).toLowerCase());
const isAdmin = (env, u) => inList(env.ADMIN_EMAILS || env.COMP_EMAILS, u.email);
const isPro = (u) => ['active', 'trialing'].includes(u.sub_status || '');
async function meOf(env, u) {
  const free = num(env.FREE_RULINGS, 3), comp = isComp(env, u), pro = isPro(u);
  return { email: u.email || '', plan: comp ? 'comp' : pro ? 'pro' : 'free', used: u.used, free, left: comp || pro ? null : Math.max(0, free - u.used), renews: pro && u.period_end ? u.period_end : null, store: pro ? (u.store || 'stripe') : '', canManage: !!u.stripe_customer, admin: isAdmin(env, u) };
}
function rowOut(r) {
  let answer = {};
  try { answer = JSON.parse(r.answer || '{}'); } catch (e) { /* keep empty */ }
  return { id: r.id, at: r.at, sport: r.sport, org: r.org, division: r.division, q: r.q, call: r.call || '', answer };
}

// ---------- Rule suggestions from users ----------
async function suggest(env, user, body) {
  const name = String(body.name || '').trim().slice(0, 120), notes = String(body.notes || '').trim().slice(0, 1500);
  let link = String(body.link || '').trim().slice(0, 400);
  if (name.length < 2) throw fail(400, 'bad_request', 'Add the tournament or organization’s name.');
  if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
  if (link) { try { new URL(link); } catch (e) { throw fail(400, 'bad_request', 'That link doesn’t look right.'); } }
  if (!link && notes.length < 10) throw fail(400, 'bad_request', 'Add a link to the rules, or describe them in the notes.');
  const day = await env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE uid = ? AND at > ?').bind(user.uid, Date.now() - 86400000).first();
  if (day && day.n >= 5) throw fail(429, 'daily_cap', 'Thanks! That’s the limit for today. Send more tomorrow.');
  await env.DB.prepare('INSERT INTO suggestions (id, uid, email, at, name, link, notes) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), user.uid, user.email, Date.now(), name, link, notes).run();
  return json(200, { ok: true });
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
async function stripe(env, path, params, method) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: method || (params ? 'POST' : 'GET'),
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
  // A web (Stripe) subscription is canceled here. An App Store subscription can only be canceled by
  // the person, in their Apple ID's Subscriptions settings; the app tells them before deleting.
  if (isPro(user) && user.store !== 'apple' && user.stripe_sub && env.STRIPE_SECRET_KEY) {
    try { await stripe(env, 'subscriptions/' + encodeURIComponent(user.stripe_sub), null, 'DELETE'); }
    catch (e) { throw fail(502, 'billing', 'Couldn’t cancel your subscription. Use Manage subscription to cancel it, then delete your account.'); }
  }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO spent (email_hash, used) VALUES (?, ?) ON CONFLICT(email_hash) DO UPDATE SET used = MAX(used, excluded.used)').bind(await sha(user.email), user.used),
    env.DB.prepare('DELETE FROM rulings WHERE uid = ?').bind(user.uid),
    env.DB.prepare('DELETE FROM sessions WHERE uid = ?').bind(user.uid),
    env.DB.prepare('UPDATE suggestions SET uid = NULL, email = NULL WHERE uid = ?').bind(user.uid),
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
    await env.DB.prepare('UPDATE users SET store = ?, stripe_customer = ?, stripe_sub = ?, sub_status = ? WHERE uid = ?')
      .bind('stripe', String(o.customer || ''), String(o.subscription || ''), 'active', String(o.client_reference_id)).run();
  } else if (/^customer\.subscription\.(created|updated|deleted)$/.test(ev.type || '')) {
    const status = ev.type.endsWith('deleted') ? 'canceled' : String(o.status || '');
    const item = o.items && o.items.data && o.items.data[0];
    const end = (o.current_period_end || (item && item.current_period_end) || 0) * 1000 || null;
    const uid = o.metadata && o.metadata.uid;
    // A Stripe subscription ending doesn't switch off a subscription bought in the iPhone app.
    const live = ['active', 'trialing'].includes(status), keep = live ? '' : " AND COALESCE(store, 'stripe') != 'apple'";
    const setStore = live ? "store = 'stripe', " : '';
    if (uid) await env.DB.prepare('UPDATE users SET ' + setStore + 'stripe_customer = ?, stripe_sub = ?, sub_status = ?, period_end = ? WHERE uid = ?' + keep).bind(String(o.customer || ''), String(o.id || ''), status, end, String(uid)).run();
    else await env.DB.prepare('UPDATE users SET ' + setStore + 'stripe_sub = ?, sub_status = ?, period_end = ? WHERE stripe_customer = ?' + keep).bind(String(o.id || ''), status, end, String(o.customer || '')).run();
  }
  return json(200, { ok: true });
}
// ---------- Subscriptions (Apple in-app purchases, iPhone app) ----------
// Each purchase carries the buyer's account id as its appAccountToken, so renewals, cancellations and
// refunds land on the right account. The Worker never trusts what the phone or a notification says
// about a subscription: it asks Apple's App Store Server API for the current state.
const APPLE_API = { Production: 'https://api.storekit.itunes.apple.com', Sandbox: 'https://api.storekit-sandbox.itunes.apple.com' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const appleReady = (env) => !!(env.APPLE_ISSUER_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY && env.APPLE_BUNDLE_ID);
function appleProducts(env) {
  const bid = String(env.APPLE_BUNDLE_ID || '').trim();
  const pick = (k, d) => String(env[k] || (bid ? bid + d : '')).trim();
  return { month: pick('APPLE_PRODUCT_MONTH', '.monthly'), year: pick('APPLE_PRODUCT_YEAR', '.yearly') };
}
const b64urlBytes = (t) => Uint8Array.from(atob(String(t).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(t).length + 3) % 4)), (c) => c.charCodeAt(0));
const b64url = (bytes) => { let t = ''; for (const b of bytes) t += String.fromCharCode(b); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
// Reads the middle part of a JWS without checking it. Only used to find which transaction to ask
// Apple about; the answer from Apple's own API is what counts.
function jwsPayload(jws) {
  try { const p = String(jws || '').split('.'); return p.length === 3 ? JSON.parse(new TextDecoder().decode(b64urlBytes(p[1]))) : null; } catch (e) { return null; }
}
let ATOK = null;
async function appleToken(env) {
  if (ATOK && ATOK.exp > Date.now() + 120000) return ATOK.token;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: 'ES256', kid: String(env.APPLE_KEY_ID).trim(), typ: 'JWT' }) + '.' + enc({ iss: String(env.APPLE_ISSUER_ID).trim(), iat: now, exp: now + 1800, aud: 'appstoreconnect-v1', bid: String(env.APPLE_BUNDLE_ID).trim() });
  const der = Uint8Array.from(atob(String(env.APPLE_PRIVATE_KEY).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  ATOK = { token: unsigned + '.' + b64url(new Uint8Array(sig)), exp: Date.now() + 1700 * 1000 };
  return ATOK.token;
}
// Current state of a subscription from Apple. Tries the environment the purchase came from first
// (TestFlight and App Review buy in Sandbox), then the other one.
async function appleSubscription(env, transactionId, envHint) {
  const sandboxOk = String(env.APPLE_SANDBOX || 'on').toLowerCase() !== 'off';
  const order = envHint === 'Sandbox' ? ['Sandbox', 'Production'] : ['Production', 'Sandbox'];
  const ours = Object.values(appleProducts(env));
  for (const where of order) {
    if (where === 'Sandbox' && !sandboxOk) continue;
    const r = await fetch(APPLE_API[where] + '/inApps/v1/subscriptions/' + encodeURIComponent(transactionId), { headers: { Authorization: 'Bearer ' + await appleToken(env) } });
    if (r.status === 404) continue;
    if (r.status === 401) { ATOK = null; throw fail(502, 'apple_auth', 'Apple refused the In-App Purchase key. Check APPLE_ISSUER_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY.'); }
    if (!r.ok) throw fail(502, 'apple', 'Couldn’t reach the App Store. Try again in a minute.');
    const d = await r.json();
    if (String(d.bundleId || '') !== String(env.APPLE_BUNDLE_ID).trim()) throw fail(400, 'wrong_app', '');
    // The newest of our subscriptions in the answer (normally there is exactly one).
    let best = null;
    for (const g of d.data || []) for (const last of g.lastTransactions || []) {
      const tx = jwsPayload(last.signedTransactionInfo) || {};
      if (!ours.includes(tx.productId)) continue;
      const sub = { status: Number(last.status), otid: String(last.originalTransactionId || tx.originalTransactionId || ''), tx };
      if (!best || Number(tx.purchaseDate || 0) > Number(best.tx.purchaseDate || 0)) best = sub;
    }
    return best;
  }
  return null;
}
// 1 = active, 4 = billing grace period (Apple is retrying the card and the person keeps access).
const appleLive = (sub) => (sub.status === 1 || sub.status === 4) && !sub.tx.revocationDate;
// Which account a subscription belongs to: its appAccountToken first, then a purchase linked earlier.
async function appleUserFor(env, sub) {
  const t = String(sub.tx.appAccountToken || '').toLowerCase();
  if (UUID_RE.test(t)) return env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(t).first();
  return sub.otid ? env.DB.prepare('SELECT * FROM users WHERE apple_otid = ?').bind(sub.otid).first() : null;
}
async function applyApple(env, user, sub) {
  const live = appleLive(sub);
  // An old App Store subscription ending doesn't switch off a newer one or a web subscription.
  if (!live && ((user.apple_otid && user.apple_otid !== sub.otid) || (isPro(user) && (user.store || 'stripe') !== 'apple'))) return false;
  await env.DB.prepare('UPDATE users SET store = ?, apple_otid = ?, sub_status = ?, period_end = ? WHERE uid = ?')
    .bind('apple', sub.otid, live ? 'active' : 'expired', Number(sub.tx.expiresDate || 0) || null, user.uid).run();
  return live;
}
// From the iPhone app after a purchase or a restore: the signed transactions it has.
async function iapLink(env, user, body) {
  if (!appleReady(env)) throw fail(503, 'billing_off', 'Purchases aren’t set up yet.');
  const list = (Array.isArray(body.transactions) ? body.transactions : []).slice(0, 10);
  const seen = new Set();
  let active = false, other = false;
  for (const jws of list) {
    const p = jwsPayload(jws);
    if (!p || !p.transactionId || String(p.bundleId || '') !== String(env.APPLE_BUNDLE_ID).trim()) continue;
    const otid = String(p.originalTransactionId || p.transactionId);
    if (seen.has(otid)) continue;
    seen.add(otid);
    const sub = await appleSubscription(env, String(p.transactionId), p.environment);
    if (!sub) continue;
    const owner = await appleUserFor(env, sub);
    // A purchase made for another account stays with that account.
    if (owner && owner.uid !== user.uid) { other = other || appleLive(sub); continue; }
    if (await applyApple(env, user, sub)) active = true;
  }
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(user.uid).first();
  return json(200, { active, other, me: await meOf(env, fresh) });
}
// App Store Server Notifications V2: renewals, cancellations, refunds.
async function appleNotification(request, env) {
  const ok = (status, msg) => json(status, { received: status === 200, msg });
  if (!appleReady(env) || !env.DB) return ok(500, 'not configured');
  const body = await request.json().catch(() => null);
  const n = jwsPayload(body && body.signedPayload);
  if (!n || !n.data) return ok(400, 'bad payload');
  if (String(n.data.bundleId || '') !== String(env.APPLE_BUNDLE_ID).trim()) return ok(200, 'other app');
  const tx = jwsPayload(n.data.signedTransactionInfo);
  if (!tx || !tx.transactionId) return ok(200, 'ignored'); // TEST notifications and the like
  try {
    await ready(env);
    const sub = await appleSubscription(env, String(tx.transactionId), n.data.environment);
    if (!sub) return ok(200, 'not ours');
    const user = await appleUserFor(env, sub);
    if (!user) return ok(200, 'no account yet'); // the app links it when the purchase finishes
    await applyApple(env, user, sub);
    return ok(200, 'updated');
  } catch (e) {
    return ok(500, 'update failed'); // Apple retries
  }
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
