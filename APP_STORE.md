# The Rulebook AI on the App Store

This repo builds The Rulebook AI as an iPhone app (Capacitor) and sells the unlimited-rulings subscription with **Apple in-app purchases**. The setup mirrors The Sports Hub's, and your Apple Developer account, Team ID and registered iPhone carry over.

- **The app** is the same screens as the website, bundled into an iPhone app. It talks to the Worker at the address in `public/config.js` (`API_URL`).
- **Subscriptions** bought in the app are checked by the Worker with Apple's App Store Server API before an account is switched to unlimited.
- **Builds** run on a GitHub-hosted Mac (`.github/workflows/ios-testflight.yml`) and upload to TestFlight, so no Mac is needed.

Bundle ID used everywhere: **`com.kollinmeubanks.rulebookai`** (in `capacitor.config.json`; it can't change after the app is created).

## 1. Apple Developer: register the bundle ID

developer.apple.com → Account → **Certificates, Identifiers & Profiles → Identifiers → +** → App IDs → App → Bundle ID (explicit) `com.kollinmeubanks.rulebookai`. No extra capabilities needed.

## 2. App Store Connect: the app and its subscriptions

1. appstoreconnect.apple.com → Apps → **+ New App**: iOS, name "The Rulebook AI" (pick another if it's taken), English, the bundle ID above, SKU `rulebookai`.
2. Your app → **Monetization → Subscriptions** → create a group named **Unlimited rulings**, then add two subscriptions with exactly these product IDs:

| Reference name | Product ID | Duration |
| --- | --- | --- |
| Unlimited Yearly | `com.kollinmeubanks.rulebookai.yearly` | 1 year |
| Unlimited Monthly | `com.kollinmeubanks.rulebookai.monthly` | 1 month |

   Set the prices you want; the app shows whatever Apple reports. Give each a display name, a description and a review screenshot (the Account screen works).
3. Your app → **App Information → App Store Server Notifications**: for Production and Sandbox enter `https://rulebookai.kollinmeubanks.workers.dev/api/apple-notifications`, **Version 2**.

## 3. Keys

App Store Connect → **Users and Access → Integrations**. Both keys work for every app on your account, so you can reuse the ones made for The Sports Hub if you still have the `.p8` files; otherwise make new ones.

- **In-App Purchase** key: the `.p8`, its Key ID and the Issuer ID. The Worker uses it.
- **App Store Connect API** key (Admin): the `.p8`, its Key ID and Issuer ID. The GitHub build uses it.

## 4. Worker (Cloudflare → rulebookai → Settings → Variables and Secrets)

| Name | Type | Value |
| --- | --- | --- |
| `APPLE_BUNDLE_ID` | Text | `com.kollinmeubanks.rulebookai` |
| `APPLE_ISSUER_ID` | Text | Issuer ID of the In-App Purchase key |
| `APPLE_KEY_ID` | Text | Key ID of the In-App Purchase key |
| `APPLE_PRIVATE_KEY` | Secret | the whole In-App Purchase `.p8` file, BEGIN and END lines included |

## 5. GitHub secrets and the first build

GitHub → RulebookAI → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `APPLE_TEAM_ID` | your Team ID |
| `ASC_KEY_ID` | Key ID of the App Store Connect API key |
| `ASC_ISSUER_ID` | its Issuer ID |
| `ASC_KEY_P8` | all the text of that `.p8` file |

Then **Actions → "iOS: build and upload to TestFlight" → Run workflow**. It takes about 15 to 25 minutes, and the build appears in App Store Connect → TestFlight shortly after. Bump `version` in `package.json` for each App Store release.

## 6. Test in TestFlight

Install the build from TestFlight, create an account, use the 3 free rulings, then subscribe from Account. TestFlight purchases are free test purchases and renew fast. Also try **Restore purchases**, **Manage subscription** and **Delete account**.

## 7. Submit for review

- **Screenshots**: 6.9" iPhone (1320 × 2868), at least 3: the Ask screen, a ruling, the Library.
- **Privacy policy URL**: `https://rulebookai.kollinmeubanks.workers.dev/privacy.html`. Terms: `/terms.html`. Add a support URL or email.
- **Subscriptions**: attach both to this version.
- **App Privacy**: Contact info (email), User content (the plays people describe), Identifiers (user ID), Purchases. Used for app functionality, linked to the user, not used for tracking.
- **App Review information**: a demo account (email and password) and these notes:

> The Rulebook AI gives youth baseball coaches and parents an AI reading of tournament rules. Describe a play on the Ask tab to get a ruling with the rules behind it. The Library tab is free with no account. New accounts get 3 free rulings; unlimited rulings is an auto-renewing subscription bought only with in-app purchase (Account tab). Accounts can be deleted from Account → Delete account. Rule summaries are our own plain-language writing; the app isn't affiliated with any tournament organization.

### Suggested listing

**Subtitle:** Youth baseball rulings, fast

**Description:**
> Was that the right call? Describe the play and The Rulebook AI gives you the ruling, the rules behind it, and a respectful way to raise it with the umpire.
>
> Pick your tournament's rule book (USSSA, Perfect Game, Training Legends, Top Gun, Triple Crown, Five Tool, SGA or NFHS), your age group, and tell it what happened. It knows the youth changes: coach pitch, run limits, no leadoffs, dropped third strike.
>
> FREE: the full rules library with search, and 3 rulings to try it.
> UNLIMITED: unlimited rulings, saved so you can pull them up at the field.
>
> The Rulebook AI is an AI reading of the rules, not an official ruling. Umpires and tournament directors have the final say.

**Keywords:** baseball,rules,umpire,rulebook,youth,coach,travel ball,USSSA,little league,tournament
