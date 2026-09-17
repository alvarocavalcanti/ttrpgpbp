# Help screenshot tooling

Committed capture scripts for the in-app help images in [`public/help/`](../../public/help/).

- **`seed.sql`** — idempotent local fixtures: screenshot users (password
  `shots-pass-1`), the "The Sunless Citadel" channel with members, NPC, safety
  tools and messages, plus a channel-less user for the empty lobby shot.
- **`capture.mjs`** — Playwright capture at 360×780 CSS @3x (1080×2340), light
  mode, mobile touch profile. Logs in by injecting a real Supabase session
  (no UI login), then writes each `public/help/*.png`.

## Run

```bash
# 1. Local Supabase up + migrations applied + .env.local written
npm run supabase:up

# 2. Seed fixtures (re-runnable)
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f scripts/help-screenshots/seed.sql

# 3. Dev server up (uses .env.local) — keep this running
npm run dev
```

Then, **in a second terminal** (the dev server must still be running), capture:

```bash
# 4. Capture (overwrites public/help/*.png)
node scripts/help-screenshots/capture.mjs
```

Or background the server in one line and capture right after it is ready:

```bash
npm run dev & until curl -s -o /dev/null http://localhost:5173; do sleep 1; done
node scripts/help-screenshots/capture.mjs
```

Then review the changed PNGs, update any affected help Markdown, and commit.

Users: `shot.gm@local.test`, `shot.p1@local.test`, `shot.p2@local.test`,
`shot.p3@local.test` (in the channel) and `shot.new@local.test` (no channels).
Password for all: `shots-pass-1`.

## Thumbnails

The `/features` page cards render at 80–96px CSS, far smaller than the 1080px
captures, so `capture.mjs` also writes a 320px WebP copy of every capture into
`public/help/thumbs/` (via `thumbs.mjs`). The cards use the thumbnails; the
help docs keep the full-size PNGs. Thumbnails are committed alongside the
captures and regenerate on every capture run.

To regenerate thumbnails from the already-committed captures — no Supabase,
no dev server needed:

```bash
node scripts/help-screenshots/thumbs.mjs
```

`SHOT_THUMB_WIDTH` overrides the 320px default (covers the largest card at 3x
device pixels with headroom).

## Notes

- `SHOT_OUT` / `SHOT_BASE_URL` env vars override the output dir and base URL.
  `SHOT_PROFILE_DIR` overrides the browser profile dir (wiped before each run).
- The script resets its browser profile every run and forces light mode, so
  captures never inherit theme/session state from a previous run.
- The script captures the full help set; it is fine to run it all and commit
  only the images that changed.
- These scripts are real tooling (committed), unlike the throwaway captures
  they replaced. Keep them working when the UI changes.
