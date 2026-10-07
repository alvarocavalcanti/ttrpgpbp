# Deployment

Checklist for setting up your own RoleByPost server. The app is a static frontend (React/Vite PWA) backed by Supabase (Postgres, Auth, Realtime, Edge Functions), so deployment is three parts: Supabase project, edge function, and the static frontend on any static host. Cloudflare Pages is the reference host.

## Prerequisites

- [ ] Node.js 26+
- [ ] npm
- [ ] A [Supabase](https://supabase.com) account (free tier works)
- [ ] A static hosting account (Cloudflare Pages, Netlify, Vercel, GitHub Pages, ...)
- [ ] Git and a clone of this repo

## 1. Create the Supabase project

- [ ] Create a new project at [supabase.com](https://supabase.com/dashboard).
- [ ] Note down the **Project URL** and **anon public key** (Settings → API).
- [ ] Note down the **Project ID / project ref** (the slug in the URL) and the **database password** you chose.
- [ ] Generate a **Supabase access token** (Account → Access Tokens) for CLI commands.

## 2. Set up Google OAuth

- [ ] Create an OAuth client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (OAuth consent screen first, then an OAuth 2.0 Client ID of type Web application).
- [ ] Brand the OAuth consent screen (APIs & Services → OAuth consent screen): set the app name, user support email, app logo (120×120 to 1200×1200px PNG/JPG, ≤1MB), app domain and authorized domains — otherwise Google shows the raw `*.supabase.co` redirect host and no logo on the consent screen.
- [ ] Publish the app (set status to **In production**) — in **Testing** mode branding only shows to whitelisted test users.
- [ ] Add the redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
- [ ] In Supabase Dashboard → Authentication → Providers → Google, enable Google and paste the client ID and secret.

## 2b. Set up email magic-link sign-in (custom SMTP)

Email sign-in needs a real SMTP provider. Supabase's built-in sender is a demo — roughly **2 messages/hour, and only to project team members** — so real players never receive a link on it. It is fine for local development only, where the local stack captures mail in **Mailpit** at <http://127.0.0.1:54324>. The reference deployment uses **Resend** (free tier: 3,000 emails/month, 100/day, no card).

- [ ] Enable the **Email** provider: Authentication → **Sign In / Providers → Email**, or set `[auth.email] enable_signup = true` in `supabase/config.toml`. The reference project shipped with it **off** (Google-only), which makes every sign-in link fail.
- [ ] Create a [Resend](https://resend.com) account and add the sending domain (`rolebypost.com`).
- [ ] Add the DKIM/SPF DNS records Resend shows to your DNS provider (Cloudflare) and wait for domain verification.
- [ ] Create a Resend API key.
- [ ] Supabase Dashboard → Authentication → Email → **SMTP Settings**: host `smtp.resend.com`, port `465` (SSL) or `587` (STARTTLS), username `resend`, password = the API key, sender `no-reply@rolebypost.com`.
- [ ] Leave link/click tracking **off** — a tracking rewrite breaks the single-use magic link.
- [ ] Only raise Authentication → **Rate Limits** if real traffic needs it; the default (about 30 magic-link requests / 5 min / IP) suits a small table.

Behavior notes:

- A first-time email sign-in creates an account (`shouldCreateUser` stays on, matching Google OAuth); the profile row is created by the `handle_new_user` trigger, using the email's local part as the initial display name.
- The link returns to `<origin>/login?redirect=<path>`; every origin must be in the redirect allowlist (step 7).
- `site_url` is intentionally **not** committed in `supabase/config.toml` — `config push` would overwrite the hosted project's Site URL. The app always passes an explicit redirect, so the Site URL fallback is never used for these flows.

## 3. Generate VAPID keys

- [ ] Generate a VAPID keypair:

  ```bash
  npx web-push generate-vapid-keys
  ```

- [ ] Keep both keys; they are referenced in step 4.

## 4. Environment variables

Copy `.env.example` and fill in the values. Note that the three `VITE_*` vars are build-time (embedded into the frontend bundle), while the others are runtime secrets for Supabase.

| Variable | Value | Where |
|---|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Static host env (build) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key | Static host env (build) |
| `VITE_VAPID_PUBLIC_KEY` | Public half of the VAPID keypair | Static host env (build) and `supabase secrets set` |
| `VITE_GA_MEASUREMENT_ID` | Optional Google Analytics 4 measurement ID (e.g. `G-XXXXXXXXXX`). When set, Google Analytics loads and page views are tracked; omit to disable analytics (local dev, self-hosted instances) | Static host env (build) |
| `VITE_CONTROLLER_NAME` | **Required for production builds** — data-controller name shown in the Privacy Policy and Terms footer (GDPR Art 13). The build fails without it; omit only for local dev. Anyone deploying their own copy must put their own identity here | Static host env (build) |
| `VITE_CONTROLLER_EMAIL` | **Required for production builds** — data-controller contact email shown next to the name. The build fails without it or with an invalid address; omit only for local dev | Static host env (build) |
| `VITE_SITE_URL` | Optional public origin used for canonical / Open Graph URLs and `sitemap.xml` (e.g. `https://rolebypost.com`). Defaults to `https://rolebypost.com`; a self-hosted copy should set its own | Static host env (build) |
| `VITE_SENTRY_DSN` | Optional client error reporting. Leave unset to disable Sentry entirely. See [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) | Static host env (build) |
| `VAPID_PRIVATE_KEY` | Private half of the VAPID keypair | `supabase secrets set VAPID_PRIVATE_KEY` |
| `ALLOWED_ORIGINS` | **Required if the app is served from any origin outside the defaults** — comma-separated list of app origins allowed to call `upload-image`, `delete-account`, and `push-notifications` (CORS). Defaults to `http://localhost:5173`, `https://ttrpgpbp.pages.dev`, `https://rolebypost.com`, and any `*.ttrpgpbp.pages.dev` preview. A self-hosted domain that is not in the list has its image uploads and account deletion blocked at the CORS preflight | `supabase secrets set ALLOWED_ORIGINS=...` |
| `SUPABASE_AUTH_GOOGLE_SECRET` | Google OAuth client secret | Supabase Dashboard → Auth → Providers → Google |

- [ ] Set the VAPID keys (and `ALLOWED_ORIGINS` if you host the frontend elsewhere) and any other Supabase secrets:

  ```bash
  supabase link --project-ref <project-ref>
  supabase secrets set VITE_VAPID_PUBLIC_KEY=<public-key> VAPID_PRIVATE_KEY=<private-key>
  supabase secrets set ALLOWED_ORIGINS=https://your-domain.example
  ```

  (Only set `ALLOWED_ORIGINS` when the app is served from an origin outside the defaults listed above.)

## 5. Apply database migrations

- [ ] Apply all migrations in `supabase/migrations/`:

  ```bash
  supabase db push
  ```

  (Alternative: run each file manually in the Supabase SQL editor. `supabase db push` is the supported path.)

- [ ] Configure the server-side push trigger. Push notifications are fired by a
  Postgres trigger (`pg_net`) that calls the `push-notifications` edge function,
  so it needs the function URL and a shared secret. Generate a secret and store
  both in `push_notification_config`:

  ```bash
  openssl rand -base64 32
  ```

  ```sql
  INSERT INTO push_notification_config (key, value) VALUES
    ('PUSH_FUNCTION_URL', 'https://<project-ref>.supabase.co/functions/v1/push-notifications'),
    ('PUSH_INTERNAL_SECRET', '<generated-secret>');
  ```

  Until this is done the trigger skips (no push), but message sending is unaffected.

- [ ] (Optional) Push delivery is observable out of the box. Every send outcome
  lands in `public.push_delivery_log` (status `sent` / `transient` / `invalid` /
  `failed`, plus one `invocation` row per notification, keyed by `event_id`).
  Query it from the SQL editor to see delivery health. Trigger dispatches are
  recorded in `public.push_invocation_log`; re-queue Edge Function invocations
  that failed at the HTTP layer with:

  ```sql
  select public.retry_failed_push_invocations();
  ```

## 6. Deploy the edge function

The push-notifications function is invoked server-side by a Postgres trigger and
authenticated with the `x-push-secret` header against the
`PUSH_INTERNAL_SECRET` value stored in `push_notification_config`
(`verify_jwt = false` in `supabase/config.toml`). It is no longer called by the
browser, so no user JWT is involved.

- [ ] Deploy the push-notifications function:

  ```bash
  supabase functions deploy push-notifications --project-ref <project-ref>
  ```

- [ ] Deploy the image-retention cleanup function. It requires a server-to-server
  secret and no-ops while `app_settings.image_retention_days` is 0 (the default).
  Store the secret in Supabase Edge Function secrets, never in frontend code:

  ```bash
  supabase secrets set CLEANUP_IMAGES_SECRET=<generated-secret>
  supabase functions deploy cleanup-images --project-ref <project-ref>
  ```

- [ ] Deploy the image upload function:

  ```bash
  supabase functions deploy upload-image --project-ref <project-ref>
  ```

  Uploaded images are stored without an automated illegal-material scan — the
  only available scanner is a paid service — so keep the admin's image-upload
  toggle off unless the group accepts that, and rely on player reports reviewed
  by the admin (Terms §7).

- [ ] Deploy the account-deletion function (GDPR erasure; the "Delete Account"
  control in Settings calls it directly from the browser with the user's JWT):

  ```bash
  supabase functions deploy delete-account --project-ref <project-ref>
  ```

- [ ] Decide the image-upload posture before announcing. Uploads ship **off**
  (`app_settings.image_uploading_enabled = false`). To allow them, flip the
  toggle in the admin console's Settings tab, or run:

  ```sql
  UPDATE app_settings SET value = 'true' WHERE key = 'image_uploading_enabled';
  ```

  Leave it off if the group does not accept unscanned uploads reviewed only on
  report. See the [image-upload trade-off](#6-deploy-the-edge-function) above
  and Terms §7.

- [ ] Store the same secret as a GitHub Actions repository secret named
  `CLEANUP_IMAGES_SECRET` (Settings → Secrets and variables → Actions). The
  `.github/workflows/cleanup-images.yml` workflow POSTs to the function daily at
  03:00 UTC (and on manual `workflow_dispatch`) with the `x-cleanup-secret`
  header; unauthorized requests are rejected and a non-2xx response fails the
  job. It reuses the existing `SUPABASE_PROJECT_ID` secret to build the function
  URL. Do not use the browser or expose the secret to users. Each deletion batch
  is recorded in `image_cleanup_audit` before removal and marked `deleted` or
  `failed` afterward.

  The `migrate` workflow redeploys the function on every merge to `main`; no
  manual deploy step is needed once the secrets above are in place.

## 7. Deploy the frontend

The public marketing routes (`/`, `/features`, `/privacy`, `/terms`) are
**prerendered at build time** with Playwright, so the bundle must be built where
Chromium can run — the Cloudflare Pages build image is an unprivileged container
with no Chromium and cannot. The reference setup therefore builds in GitHub
Actions and uploads `dist/` to Pages.

- [ ] Build the static bundle + prerender locally:

  ```bash
  npm install
  npx playwright install chromium
  npm run build:seo
  ```

  Output goes to `dist/` (`index.html`, `features.html`, `privacy.html`,
  `terms.html`, `app-shell/index.html`, `404.html`, `_redirects`, `robots.txt`,
  `sitemap.xml`). `npm run build` alone skips prerender (used for typecheck/CI).
- [ ] Cloudflare Pages (reference):
  - Create a new Pages project connected to your repo.
  - **Disable automatic Git builds** (Settings → Builds & deployments): GitHub
    Actions owns the deployment via Direct Upload, and Pages does not allow
    native Git builds and Direct Upload on the same branch triggers.
  - Add your custom domain (Workers & Pages → project → **Custom domains**). The reference deployment serves both `https://rolebypost.com` and the default `https://<project>.pages.dev`; keep both live so installed PWAs and old links keep working. Do **not** redirect `pages.dev` to the custom domain — PWA installs, service workers, and push subscriptions are origin-bound, so a redirect would break them.
- [ ] GitHub Actions deployment ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)):
  - Repository secret `CLOUDFLARE_API_TOKEN` (My Profile → API Tokens → Custom token with **Account → Cloudflare Pages → Edit**).
  - Repository secret `CLOUDFLARE_ACCOUNT_ID`.
  - Repository secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VITE_GA_MEASUREMENT_ID`, `VITE_SENTRY_DSN`, `VITE_CONTROLLER_NAME`, `VITE_CONTROLLER_EMAIL`; repository **variable** `VITE_SITE_URL`. Pushes to `main` deploy production; same-repo PRs get a preview.
- [ ] Point DNS: for a Cloudflare-managed zone, add an apex CNAME (`rolebypost.com` → `<project>.pages.dev`, proxied) and wait for certificate issuance.
- [ ] Allow auth redirects for every origin the app is served from: `supabase config push` (or Dashboard → Auth → URL Configuration). `supabase/config.toml` already lists the local (`localhost:5173`), `rolebypost.com`, and `*.ttrpgpbp.pages.dev` entries — with `/**` path wildcards for the magic-link `/login?redirect=…` return. Keep the list complete: `config push` replaces the whole allowlist. See step 2b for email delivery.
- [ ] Any other static host works — but do **not** configure a catch-all SPA fallback to `index.html`: `index.html` is the prerendered marketing landing, and serving it for unknown paths would put marketing content on 404s. Instead:
  - Serve the prerendered public files directly: `/` → `index.html`, `/features` → `features.html`, `/privacy` → `privacy.html`, `/terms` → `terms.html` (Cloudflare Pages does this from the filenames).
  - Rewrite only the app/auth routes to the empty app shell (`app-shell/index.html`), matching the rules in `public/_redirects` (see `src/lib/publicRoutes.ts` for the source of truth).
  - Return `404.html` with an HTTP 404 status for everything else.
  - Keep the app shell on every app route (`public/_headers` lists them — keep it in sync with `src/App.tsx`) and the worker script served `Cache-Control: no-cache`: a reload at `/channel/c1` requests that path, and a long-cached shell traps installed PWAs on the old version after an update.
- [ ] Regenerating the social share card (only when the brand art or tagline changes): `npm run seo:og` rewrites the committed `public/og-image.png`.

## 8. Promote the first server admin

- [ ] Promote your account to server admin (needed for the `/admin` view):

  ```sql
  UPDATE profiles SET server_admin = true WHERE email = '<your-email>';
  ```

- [ ] Alternatively, demote the built-in admin:

  ```sql
  UPDATE profiles SET server_admin = false WHERE email = '<your-email>';
  ```

## 9. Verify

- [ ] Google sign-in works.
- [ ] Migrations are applied (create a channel, join with a second account).
- [ ] Push notifications: install the PWA (iOS requires adding to Home Screen), grant permission, and have someone send a message.
- [ ] `/admin` loads for the server admin and hides for everyone else.

## 10. Search Console & Bing Webmaster Tools

`npm run build:seo` writes `dist/sitemap.xml` and `dist/robots.txt`; the sitemap
is served at `https://<domain>/sitemap.xml` and `robots.txt` points at it. Both
tools are free. See [docs/SEO-MONITORING.md](docs/SEO-MONITORING.md) for the
monthly review cadence.

- [ ] **Google Search Console** — add a **Domain** property for the apex domain
  (verified by DNS, provider-agnostic), or a **URL-prefix** property for
  `https://rolebypost.com`. Under **Sitemaps**, submit
  `https://rolebypost.com/sitemap.xml`.
- [ ] **Bing Webmaster Tools** — sign in with a Google account and pick
  **Import from Google Search Console** (no meta tag needed). This copies site
  ownership and the sitemap *reference* only — no historical GSC data carries
  over. Bing says reports can take **up to 48 hours** after it verifies the site;
  that reporting delay is separate from crawling and indexing, and Bing gives no
  fixed indexing schedule (a new site can take a couple of weeks to appear in
  search). If reports are still empty after 48 hours, check the import and
  verification status. Under **Sitemaps**, submit
  `https://rolebypost.com/sitemap.xml` manually — Bing's import batches sitemap
  processing, so the imported entry may sit pending. The meta tag is a fallback
  only: verify with `<meta name="msvalidate.01" content="…">` in the `<head>` of
  `index.html` (it survives into `dist/index.html`); the value is
  account-specific, so add it only once Bing issues it.
- [ ] Confirm both properties report the sitemap as read and have no coverage
  errors for the public routes.
