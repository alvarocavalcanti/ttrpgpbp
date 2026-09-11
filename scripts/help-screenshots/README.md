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
# 1. Local Supabase up + migrations applied
npx supabase start

# 2. Seed fixtures (re-runnable)
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f scripts/help-screenshots/seed.sql

# 3. Dev server up (uses .env.local)
npm run dev

# 4. Capture (overwrites public/help/*.png)
node scripts/help-screenshots/capture.mjs
```

Then review the changed PNGs, update any affected help Markdown, and commit.

Users: `shot.gm@local.test`, `shot.p1@local.test`, `shot.p2@local.test`,
`shot.p3@local.test` (in the channel) and `shot.new@local.test` (no channels).
Password for all: `shots-pass-1`.

## Notes

- `SHOT_OUT` / `SHOT_BASE_URL` env vars override the output dir and base URL.
- The script captures the full help set; it is fine to run it all and commit
  only the images that changed.
- These scripts are real tooling (committed), unlike the throwaway captures
  they replaced. Keep them working when the UI changes.
