# Deployment

Checklist for setting up your own RoleByPost server. The app is a static frontend (React/Vite PWA) backed by Supabase (Postgres, Auth, Realtime, Edge Functions), so deployment is three parts: Supabase project, edge function, and the static frontend on any static host. Cloudflare Pages is the reference host.

## Prerequisites

- [ ] Node.js 20+
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
| `VAPID_PRIVATE_KEY` | Private half of the VAPID keypair | `supabase secrets set VAPID_PRIVATE_KEY` |
| `ALLOWED_ORIGINS` | Optional comma-separated list of app origins allowed to call the push-notifications function (CORS). Defaults to `http://localhost:5173`, `https://ttrpgpbp.pages.dev`, `https://rolebypost.com`, and any `*.ttrpgpbp.pages.dev` preview | `supabase secrets set ALLOWED_ORIGINS=...` |
| `SUPABASE_AUTH_GOOGLE_SECRET` | Google OAuth client secret | Supabase Dashboard → Auth → Providers → Google |

- [ ] Set the VAPID keys (and `ALLOWED_ORIGINS` if you host the frontend elsewhere) and any other Supabase secrets:

  ```bash
  supabase link --project-ref <project-ref>
  supabase secrets set VITE_VAPID_PUBLIC_KEY=<public-key> VAPID_PRIVATE_KEY=<private-key>
  ```

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
  Store secret in Supabase Edge Function secrets, never in frontend code:

  ```bash
  supabase secrets set CLEANUP_IMAGES_SECRET=<generated-secret>
  supabase functions deploy cleanup-images --project-ref <project-ref>
  ```

  Schedule a daily `POST` from a trusted server scheduler. It must send
  `x-cleanup-secret: <generated-secret>`; unauthorized requests are rejected.
  For Supabase `pg_cron`/`pg_net`, keep the secret in Vault and pass it as a
  request header. Do not use the browser or expose the secret to users.
  Each deletion batch is recorded in `image_cleanup_audit` before removal and
  marked `deleted` or `failed` afterward.

## 7. Deploy the frontend

- [ ] Build the static bundle:

  ```bash
  npm install
  npm run build
  ```

  Output goes to `dist/`.
- [ ] Cloudflare Pages (reference):
  - Create a new Pages project connected to your repo.
  - Build command: `npm run build`, output directory: `dist`.
  - Add the three `VITE_*` environment variables (Production and Preview).
  - Add your custom domain (Workers & Pages → project → **Custom domains**). The reference deployment serves both `https://rolebypost.com` and the default `https://<project>.pages.dev`; keep both live so installed PWAs and old links keep working. Do **not** redirect `pages.dev` to the custom domain — PWA installs, service workers, and push subscriptions are origin-bound, so a redirect would break them.
- [ ] Point DNS: for a Cloudflare-managed zone, add an apex CNAME (`rolebypost.com` → `<project>.pages.dev`, proxied) and wait for certificate issuance.
- [ ] Allow OAuth redirects for every origin the app is served from: `supabase config push` (or Dashboard → Auth → URL Configuration) so `https://rolebypost.com` and `https://<project>.pages.dev` are in the additional redirect URLs.
- [ ] Any other static host works — point it at `dist/`, set the `VITE_*` vars, and make sure all routes fall back to `index.html` (SPA routing). Cloudflare Pages does this automatically.

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
