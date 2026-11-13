# The Rulebook AI

Describe a play, get the ruling and the rules behind it. A standalone version of the Rulebook AI from The Sports Hub.

- `public/` is the app (served as-is). `public/rules/` holds each sport's rule summaries, `public/sports.js` lists the sports.
- `src/worker.js` is the Cloudflare Worker: sign-in check, free-ruling count, the AI call, Stripe subscriptions.
- `src/sports/` builds the AI question for each sport.
- Rulings and accounts are stored in the D1 database `rulebook-ai` (tables are created automatically).

## Deploy (Cloudflare, from a phone)

1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → pick `keubanks16/RulebookAI` → **Deploy**. Every push to `main` redeploys.
2. Open the Worker → **Settings → Variables and Secrets** → add `ANTHROPIC_API_KEY` (Secret).
3. Optional: `COMP_EMAILS` (Text) = your sign-in email, for unlimited free rulings on your own account. Create your account in the app first, since emails aren't verified at sign-up.

The app then works at the Worker's `workers.dev` address. Add a custom domain under **Settings → Domains & Routes**.

## Accounts

The app has its own accounts (email and password), stored in the D1 database. Nothing is shared with The Sports Hub.

Password reset by email is off until you add `RESEND_API_KEY` (Secret, from resend.com) and `MAIL_FROM` (Text, a sender on a domain verified in Resend). Until then, "Forgot password" tells people to contact support; set `SUPPORT_EMAIL` in `public/config.js` to show an address.

## Subscriptions (Stripe)

Until these are set, the app says subscriptions open soon.

1. In Stripe, create a product with a monthly price (and a yearly one if you want it).
2. Add to the Worker: `STRIPE_SECRET_KEY` (Secret), `STRIPE_PRICE_MONTH`, optional `STRIPE_PRICE_YEAR`, `PRICE_LABEL_MONTH` (e.g. `$4.99 / month`), `PRICE_LABEL_YEAR`.
3. Stripe → Developers → Webhooks → add endpoint `https://<your-site>/api/stripe-webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Add its signing secret as `STRIPE_WEBHOOK_SECRET` (Secret).
4. Turn on the Stripe customer portal (Settings → Billing → Customer portal) so "Manage subscription" works.

Other settings (`FREE_RULINGS`, `DAILY_CAP`, `MODEL`) are listed at the top of `src/worker.js`.

## iPhone app

See `APP_STORE.md`. The app is built from `public/` by `.github/workflows/ios-testflight.yml` and sells the subscription with Apple in-app purchases.

## Rule suggestions

Signed-in users can suggest a tournament's rules from the Library tab. Suggestions show on the Account tab for the emails in `ADMIN_EMAILS` (or `COMP_EMAILS` if that isn't set).

## Adding a sport

1. Add `public/rules/<sport>.js` (same shape as `baseball.js`).
2. Add `src/sports/<sport>.js` exporting `clean`, `division`, `orgName`, `buildPrompt`, and register it in `src/sports/index.js`.
3. Add its entry to `ASK` in `public/sports.js` and set `live: true`.

Run `node --no-warnings test/test.mjs` to check.
