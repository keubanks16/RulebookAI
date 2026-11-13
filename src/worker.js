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
//   FIREBASE_PROJECT_ID    Text    optional; the Firebase project people sign in with. Default the-sports-hub-57584.
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
const DEFAULT_PROJECT = 'the-sports-hub-57584';
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
  const who = await signedIn(request, env);
  const user = await loadUser(env, who);

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
  if (path === 'forget') return forget(env, user);
  throw fail(404, 'bad_request', 'Unknown request.');
}

function config(env) {
  return {
    free: num(env.FREE_RULINGS, 3),
    billing: !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTH),
    month: env.PRICE_LABEL_MONTH || 'Monthly',
    year: env.STRIPE_PRICE_YEAR ? (env.PRICE_LABEL_YEAR || 'Yearly') : '',
  };
}

// ---------- Database ----------
let READY = false;
async function ready(env) {
  if (READY) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, email TEXT, used INTEGER NOT NULL DEFAULT 0, stripe_customer TEXT, stripe_sub TEXT, sub_status TEXT, period_end INTEGER, created INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rulings (id TEXT PRIMARY KEY, uid TEXT NOT NULL, at INTEGER NOT NULL, sport TEXT, org TEXT, division TEXT, q TEXT, call TEXT, answer TEXT)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS rulings_uid_at ON rulings (uid, at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS users_customer ON users (stripe_customer)'),
  ]);
  READY = true;
}
async function loadUser(env, who) {
  let u = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(who.uid).first();
  if (!u) {
    await env.DB.prepare('INSERT OR IGNORE INTO users (uid, email, used, created) VALUES (?, ?, 0, ?)').bind(who.uid, who.email, Date.now()).run();
    u = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(who.uid).first();
  } else if (who.email && u.email !== who.email) {
    await env.DB.prepare('UPDATE users SET email = ? WHERE uid = ?').bind(who.email, who.uid).run();
    u.email = who.email;
  }
  return u;
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

// ---------- Sign-in (Firebase ID tokens) ----------
async function signedIn(request, env) {
  const m = /^Bearer\s+(.+)$/.exec(request.headers.get('authorization') || '');
  const p = m && await verifyIdToken(m[1], env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT);
  if (!p) throw fail(401, 'sign_in', 'Sign in to continue.');
  return { uid: p.sub, email: typeof p.email === 'string' ? p.email.slice(0, 200) : '' };
}
let JWKS = null;
const b64urlBytes = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
async function verifyIdToken(tok, pid) {
  try {
    const parts = String(tok).split('.');
    if (parts.length !== 3) return null;
    const parse = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
    const h = parse(parts[0]), p = parse(parts[1]);
    const now = Date.now() / 1000;
    if (h.alg !== 'RS256' || !h.kid) return null;
    if (p.aud !== pid || p.iss !== 'https://securetoken.google.com/' + pid) return null;
    if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 128) return null;
    if (!(p.exp > now) || !(p.iat <= now + 300)) return null;
    let jwk = (await googleKeys(false)).find((k) => k.kid === h.kid);
    if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === h.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    return ok ? p : null;
  } catch (e) { return null; }
}
async function googleKeys(fresh) {
  if (!fresh && JWKS && JWKS.exp > Date.now()) return JWKS.keys;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const d = await r.json().catch(() => null);
  if (!d || !Array.isArray(d.keys)) return (JWKS && JWKS.keys) || [];
  JWKS = { keys: d.keys, exp: Date.now() + 3600000 };
  return d.keys;
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
// Removes this person's Rulebook AI data. Their sign-in stays, because it is shared with The Sports Hub.
async function forget(env, user) {
  if (isPro(user)) throw fail(400, 'subscribed', 'Cancel your subscription first (Manage subscription), then erase your data.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rulings WHERE uid = ?').bind(user.uid),
    // The count of free rulings used stays, so erasing data doesn't hand out more free rulings.
    env.DB.prepare('UPDATE users SET email = NULL WHERE uid = ?').bind(user.uid),
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
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + raw)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
  return parts.v1.some((v) => v.length === hex.length && same(v, hex));
}
function same(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
