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
| `SUPABASE_AUTH_GOOGLE_SECRET` | Google OAuth client secret | Supabase Dashboard → Auth → Providers → Google |

- [ ] Set the VAPID keys and any other Supabase secrets:

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

## 6. Deploy the edge function

- [ ] Deploy the push-notifications function:

  ```bash
  supabase functions deploy push-notifications --project-ref <project-ref>
  ```

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
