# Release Readiness Audit — 2026-09-25

## Audit Prompt

> You are a Release/Platform engineer writing ONE NEW audit pillar for a pre-public-release FINAL audit: "Release readiness". This pillar did not exist in prior rounds — you define it. READ-ONLY: do NOT modify code, do NOT run `gh`, do NOT run tests/builds/DB/`supabase`. Judge whether the repo is ready to be publicly released/announced: versioning, PWA update/reload lifecycle (the #554/#576/#577/#601 cluster), deployment and config accuracy (DEPLOYMENT.md vs the edge functions and secrets after #600), CI/CD pins, migrations and schema, observability/ops and the zero-cost constraint, docs completeness, and the #236/#552 abuse deferrals. Every finding cites `file:line`; severity P0/P1/P2; tagged [NEW]/[OPEN]/[INTENTIONAL]. Write the report to `docs/audit/20260925/audit_release_readiness.md`.

**Date:** 2026-09-25
**Scope:** Release surface — versioning (`package.json`, git tags, About/UI, `docs/CHANGELOG.md`, AGENTS.md release rule); PWA update/reload lifecycle (`src/lib/pwaUpdate.ts`, `src/lib/hardReload.ts`, `src/sw.ts`, `vite.config.ts`, `public/_headers`, `src/components/PwaUpdateBanner.tsx`); deployment/config (`DEPLOYMENT.md`, `.env.example`, `supabase/config.toml`, the four edge functions, `VITE_CONTROLLER_*` gate, `ALLOWED_ORIGINS`, VAPID, `CLEANUP_IMAGES_SECRET`); CI/CD (`.github/workflows/{ci,migrate,cleanup-images}.yml`, `scripts/git/*.sh`, Node/Supabase CLI pins); 120 migrations; ops docs (`docs/OBSERVABILITY.md`, `docs/BACKUP_RESTORE.md`); docs completeness (README, FEATURES, CHANGELOG, help, CONTRIBUTING, LICENSE).
**Verification commands run + results (read-only; no code, DB, build, tests, or `gh`):**

- `git log`, `git tag`, `git ls-tree`, `git diff` — HEAD is `c055ca1` on `chore/final-release-audit`, identical to `origin/main`; **0 git tags**; latest migration `20260924164257_drop_upload_scanning.sql` is the newest on both HEAD and `origin/main`.
- Orchestrator-run suite (not re-run here): tsc 0 errors; oxlint 0 errors / 54 warnings; vitest 1955 passed / 146 files; coverage 93.3 / 85.46 / 90.84 / 96.07; build passed (precache 45 entries / 1759.55 KiB, >500 kB chunk warning); `lint:md` 0; cspell 0; pgTAP 411 PASS after a clean `supabase db reset`; Playwright E2E 7 passed.
- All claims verified by file reads / grep against the paths above. No paid-tier fact asserted without naming its cost model.

---

## Executive Summary

The engine and the delivery pipeline are release-grade. The PWA update/reload cluster (#554/#576/#577/#601) is genuinely closed: build-id handshake plus a one-per-session self-heal (`src/lib/pwaUpdate.ts:59-119`), a Safari-safe navigation reload (`src/lib/hardReload.ts:12-32`), a worker that self-reloads on `activate` and serves navigation network-first so a reload can never re-serve the stale shell (`src/sw.ts:28-76`), and per-route `Cache-Control: no-cache` for every app route (`public/_headers:14-49`). CI is pinned and coherent (Node 26 = `.nvmrc`, Supabase CLI `v2.117.0` in both workflows), the migration set is ordered and typegen-fresh (regenerated in the same commit as the latest migration), and the docs read for players, not developers.

**No P0.** The app is functionally ready to announce. The gaps are the last-mile release ceremony and self-host accuracy: the repo has **no version** (still `0.0.0`, zero tags, no release notes), `DEPLOYMENT.md` **never tells an operator to deploy `delete-account`** (so a self-hosted GDPR delete 404s), it **understates `ALLOWED_ORIGINS`** (now required CORS for image uploads and account deletion, not just push), and the documented backup RPO assumes **Supabase Pro ($25/org/month) + paid PITR** that the zero-cost constraint cannot use. Four P1s, all documentation/ops, all fixable before the announcement; five P2s of polish.

---

## Prior findings disposition

**N/A — new pillar.** There is no 20260920 release-readiness report to re-verify. Cross-pillar dependencies were checked for blockers only: the 2026-09-20 legal P1 (CSAM detection had no report path, `docs/audit/20260920/audit_legal_terms.md:68`) is moot — PR #600 removed the scanner and its pipeline entirely (`supabase/migrations/20260924164257_drop_upload_scanning.sql`), and DEPLOYMENT.md now states uploads are left unscanned (`DEPLOYMENT.md:128-131`). No other pillar's P0/P1 blocks this one.

---

## P0

None. No defect found that blocks a public release.

## P1

### 1. `DEPLOYMENT.md` never deploys `delete-account` — a self-hosted GDPR "Delete Account" 404s [NEW]

**Evidence:**

- `DEPLOYMENT.md:99-131` (step 6) deploys exactly three functions: `push-notifications` (`:107-111`), `cleanup-images` (`:113-120`), `upload-image` (`:122-126`). `delete-account` is mentioned nowhere in the file (grep: zero hits).
- The client calls it: `src/features/auth/authApi.ts:56` — `supabase.functions.invoke('delete-account', { method: 'POST' })`, surfaced by the "Delete Account" settings control (`src/features/auth/ProfileSettings.tsx:394`).
- The reference pipeline does deploy it: `.github/workflows/migrate.yml:39` — `supabase functions deploy delete-account ...`.
- `supabase/config.toml:13-39` declares only the other three functions; `delete-account` relies on the default `verify_jwt = true`, which is correct for a browser-invoked function but is nowhere documented.

**Problem:** An operator who follows DEPLOYMENT.md end to end gets a deployed app whose "Delete Account" button (a GDPR erasure feature promised in the Terms/Privacy) fails with a function-not-found error. The reference deployment is fine because `migrate.yml` covers it, but DEPLOYMENT.md is the documented self-host path and it is incomplete.

**Fix:** Add a deploy step for `delete-account` alongside the others in step 6, and note that it stays on the default `verify_jwt = true` because the browser invokes it with the user's JWT (mirror `upload-image`). Optionally add an explicit `[functions.delete-account] verify_jwt = true` block to `supabase/config.toml` so all four functions are declared.

**Effort:** XS (three doc lines; optional three-line config block).

### 2. `ALLOWED_ORIGINS` is documented as optional and scoped to push, but it now CORS-gates image upload and account deletion [NEW]

**Evidence:**

- `DEPLOYMENT.md:51` — "Optional comma-separated list of app origins allowed to call the **push-notifications** function (CORS)."
- It is read by three functions: `supabase/functions/upload-image/index.ts:11-17` and `supabase/functions/delete-account/index.ts:5-11` (both browser-invoked from the app origin), plus the now server-only `supabase/functions/push-notifications/index.ts:11-14`.
- Default allowlist is the reference origins only — `supabase/functions/upload-image/logic.ts:6-16` and `supabase/functions/delete-account/logic.ts:23-37`: `http://localhost:5173`, `https://ttrpgpbp.pages.dev`, `https://rolebypost.com`, plus `*.ttrpgpbp.pages.dev`. `buildCorsHeaders` echoes `Access-Control-Allow-Origin` **only** when the origin is allowlisted (`upload-image/logic.ts:28-40`, `delete-account/logic.ts:49-61`).
- `DEPLOYMENT.md:54-58` only sets `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, never `ALLOWED_ORIGINS`.

**Problem:** A self-hosted instance on any domain other than the reference origins (`app.example.com`) will have every `upload-image` and `delete-account` request blocked at the CORS preflight unless it sets `ALLOWED_ORIGINS`, yet the docs call that variable optional and describe it as push-only. This is a silent break of two user-facing features (image uploads, account deletion) for exactly the self-hosting audience DEPLOYMENT.md targets.

**Fix:** Reword `DEPLOYMENT.md:51` to "required if the app is served from any origin outside the defaults; gates CORS for image upload, account deletion, and push", and add `ALLOWED_ORIGINS=https://your-domain` to the `supabase secrets set` example.

**Effort:** XS.

### 3. The public release has no version — `0.0.0`, zero git tags, no release notes, no version surfaced [NEW]

**Evidence:**

- `package.json:4` — `"version": "0.0.0"` (Vite scaffold placeholder, never bumped).
- `git tag` returns nothing (0 tags); the release history is date-only in `docs/CHANGELOG.md:5` (`## 2026-09-25`), with no `v1.0.0` heading or release-notes document.
- The About page shows attribution and links but no version (`src/features/auth/AboutPage.tsx:3-62`; its test has no version assertion).
- `AGENTS.md:200-202` — the entire release-management rule is "When instructed to generate a new version, update the version in all relevant files", which names no files and has never run.

**Problem:** "Publicly released" with the source manifest still at `0.0.0` and no tag means users, packagers, and bug reports have no stable identifier to reference, and there is no artifact to point at for the announcement. This is the one gap that most directly says "we have not actually cut a release yet".

**Fix:** Bump `package.json` to `1.0.0`; add a `## 1.0.0 — 2026-09-25` release-notes section (the date heading already there becomes the release body); tag `v1.0.0` at the announcement commit; surface the version in the About page (e.g. a small "Role by Post v1.0.0" line) or Settings. Make the AGENTS.md rule concrete by listing `package.json` and the release tag as the files to update.

**Effort:** S.

### 4. Documented backup RPO requires Supabase Pro; the free tier has no backups [NEW]

**Evidence:**

- `docs/BACKUP_RESTORE.md:5` — "**RPO:** 24 hours (daily backups in Supabase Pro tier) or up to the minute using Point-in-Time Recovery (PITR)."
- `docs/BACKUP_RESTORE.md:8-15` — the primary restore procedure is PITR, explicitly "If you have PITR enabled (Pro Tier)".
- The only non-Pro path is the manual drill (`docs/BACKUP_RESTORE.md:17-32`), which no schedule invokes.

**Cost model:** Supabase Pro is **$25 per organization per month** and PITR is a paid add-on on top; the free tier keeps no automated database backups (and only ~1 day of logs). Under the project's zero-cost constraint, the documented 24-hour RPO is unattainable: on the free tier the real RPO is "whenever someone last ran the manual dump", which is effectively never.

**Problem:** A public launch with real player messages and channels has no committed backup story that matches the zero-cost constraint, and the doc's headline targets silently assume a tier the project cannot buy. Data loss on a failed migration or a bad deploy would be unrecoverable.

**Fix:** Add a free scheduled backup path — a small GitHub Actions workflow (the repo already runs scheduled Actions for `cleanup-images`) that runs `supabase db dump` and uploads the artifact — or, if that is out of scope for 1.0, state plainly at the top of BACKUP_RESTORE.md that the free tier has no automated backups and give an explicit operator-run cadence plus the manual drill. Either way, remove the implication that 24-hour RPO is available by default.

**Effort:** M (one workflow or one honest doc rewrite + a drill record).

## P2

### 1. `DEPLOYMENT.md` env table omits `VITE_SENTRY_DSN` [NEW]

**Evidence:** `.env.example:7` ships `VITE_SENTRY_DSN=`; `src/env.ts:5` reads it; `src/lib/sentry.ts:34` initializes Sentry only when it is set. The DEPLOYMENT.md table (`DEPLOYMENT.md:42-52`) lists six `VITE_*`/secret vars but not `VITE_SENTRY_DSN`, and the word "Sentry" does not appear in the file.

**Problem:** An operator cannot discover error reporting from the deployment guide; they would have to read `.env.example` or `docs/OBSERVABILITY.md`. Minor, but the deployment table is meant to be exhaustive.

**Fix:** Add a `VITE_SENTRY_DSN` row ("Optional — client error reporting; leave unset to disable") and cross-link `docs/OBSERVABILITY.md`.

**Effort:** XS.

### 2. `BACKUP_RESTORE.md` references a script that does not exist, and mixes dump APIs [NEW]

**Evidence:** `docs/BACKUP_RESTORE.md:63` — `npm run test:e2e`. `package.json:7-22` defines `test` and `test:coverage` but no `test:e2e` (Playwright is run via `npx playwright test`; `.husky/pre-push` calls it directly). The same file mixes `supabase db dump --project-ref` (`:22`) with `--db-url` (`:41-42`) and a `supabase db start` + `psql` restore (`:28-29`) that does not match the reset-based flow that follows (`:47-55`).

**Problem:** An operator following the restore drill hits a missing-script failure at the verification step, and the two dump sections give inconsistent guidance.

**Fix:** Replace `npm run test:e2e` with `npx playwright test` (or `npm run test`), and de-duplicate the two drill sections into one consistent CLI flow.

**Effort:** XS.

### 3. Observability alerting is manual and leans on paid-tier log retention [NEW]

**Evidence:** `docs/OBSERVABILITY.md:15-29` — push-delivery alerting is a hand-built Supabase Dashboard "Log Alert" against `push_delivery_log`; no alert configuration is committed to the repo. Sentry is optional and DSN-gated (`docs/OBSERVABILITY.md:1-9`, `src/lib/sentry.ts:34-48`).

**Cost model:** The free tier keeps ~1 day of logs and has no log drains; a Pro plan is **$25/org/month** and external drains are a further add-on. Sentry's free Developer quota is small (roughly 5k errors / 50 session replays per month) and replays stop once exhausted unless upgraded.

**Problem:** On the zero-cost tier there is no automated alert an operator will actually receive; a Friday-night push or upload failure is gone before it is noticed. Not a launch blocker for a small invitational instance, but the doc oversells the out-of-the-box posture.

**Fix:** State the free-tier reality in `docs/OBSERVABILITY.md` (manual dashboard review within ~1 day) and add one cheap free-tier check to the ops doc (e.g. the existing `retry_failed_push_invocations()` query or a scheduled workflow that fails loudly).

**Effort:** XS.

### 4. No rate limiting on uploads; abuse controls remain deferred (#236/#552) [OPEN]

**Evidence:** `supabase/functions/upload-image/index.ts:94-109` enforces only the admin toggle and the size cap before storing — no per-user or per-window rate limit. The only throttle in the codebase is join-password attempts (`supabase/migrations/20260831140000_issue_335_authz_hardening.sql:506-575`). The "image uploads" master toggle is off by default (`docs/FEATURES.md` Settings entry; `DEPLOYMENT.md:128-131`).

**Problem:** Issues #236 (rate/throttle) and #552 (trust & safety) are open deferrals. With uploads enabled and no per-user cap, one account can drive unbounded storage/egress; account creation and message sending are likewise uncapped. For an invite-only or small instance this is low risk; for an open announcement it is a real (if bounded) exposure.

**Fix:** None required for this release if the instance is invite-gated and uploads stay off by default — mark [INTENTIONAL deferral] and say so in the release notes. Otherwise add a simple rolling per-user upload cap in `upload-image` (the removed `scan-upload` had one as `MAX_UPLOADS_PER_HOUR`, see `docs/audit/20260920/audit_security.md:84`).

**Effort:** S (if built) / none (if accepted).

### 5. `.env.example` hard-codes the maintainer's real data-controller identity [NEW]

**Evidence:** `.env.example:8-9` — `VITE_CONTROLLER_NAME=Alvaro Cavalcanti`, `VITE_CONTROLLER_EMAIL=alvarovictor@gmail.com`. The build gate makes these required in production (`vite.config.ts:27-39`, `src/env.ts:14-18`), and DEPLOYMENT.md warns operators to put their own identity in (`DEPLOYMENT.md:48-49`).

**Problem:** An operator who copies `.env.example` and deploys gets the maintainer's name and email rendered as the GDPR data controller in the Privacy and Terms footers (`src/features/auth/DataController.tsx:7-18`) — an attribution and compliance mistake that is easy to make because the values look like working defaults.

**Fix:** Use obvious placeholders (`VITE_CONTROLLER_NAME=Your Name`, `VITE_CONTROLLER_EMAIL=you@example.com`) so a copied file cannot silently ship the wrong controller.

**Effort:** XS.

---

## What's sound — do not touch

- **PWA update/reload lifecycle is release-grade.** Build-id handshake with a one-per-session self-heal (`src/lib/pwaUpdate.ts:59-119`), a single-flight reload that waits for the new worker's `activated` state instead of a clock (`pwaUpdate.ts:168-219`), Safari-safe same-URL navigation with a cache-busting self-heal path (`src/lib/hardReload.ts:12-32`), worker-side `activate` reload for Android plus network-first navigation that can never re-serve the old shell (`src/sw.ts:28-76`), and `Cache-Control: no-cache` on `/`, `/index.html`, `/sw.js`, and every app route including `/channel/:id` (`public/_headers:14-49`) — Cloudflare Pages supports the `:id` placeholders used there. The `__APP_BUILD__` define is wired (`vite.config.ts:23,42-44`; `src/vite-env.d.ts:7`).
- **CI/CD is coherent and pinned.** Node `26` in `ci.yml:64,111` matches `.nvmrc:1`; Supabase CLI `v2.117.0` in `ci.yml:28,70,117`, `migrate.yml:20`, `cleanup-images.yml`; migration order is guarded (`scripts/git/check-migration-order.sh`, `ci.yml:23`) and types drift is enforced in CI (`ci.yml:45-48`) and pre-commit (`scripts/git/check-types-staged.sh`, `.husky/pre-commit`); `cleanup-images.yml` accepts only 2xx and is single-flight.
- **Migrations and schema.** 120 migrations; the latest, `20260924164257_drop_upload_scanning.sql`, sorts last on HEAD and `origin/main`, so `check:migration-order` passes. `src/types/database.ts` was regenerated in the same commit as the newest migration (`be0d0fa`, verified via `git log` on both paths). All three `CREATE INDEX CONCURRENTLY` migrations are single-statement files (`20260905175441`, `20260908170031`, `20260918095418`).
- **Build gates fail closed.** A production build without `VITE_CONTROLLER_NAME`/`VITE_CONTROLLER_EMAIL` throws (`vite.config.ts:27-39`, `src/env.ts:14-18`); env parsing is Zod-validated.
- **Edge-function secrets are correct.** `cleanup-images` authenticates with `x-cleanup-secret` against `CLEANUP_IMAGES_SECRET` (`supabase/config.toml:27-31`, `cleanup-images/index.ts:10,32,78`); `push-notifications` runs `verify_jwt = false` with a DB-trigger shared secret (`config.toml:13-25`); `upload-image` runs `verify_jwt = true` and re-enforces GM-of-channel against its service-role client.
- **Docs are complete and player-facing.** README, FEATURES, CONTRIBUTING, MIT LICENSE, and legal pages present; CHANGELOG top heading is the merge date and written for players (`docs/CHANGELOG.md:5-24`); every help doc's screenshot reference resolves to a committed PNG under `public/help/` (10 referenced, 10 present); the About page links the project and creator.
- **The #600 upload change is consistent across code and copy.** The paid scanner was removed end to end, uploads default off, and DEPLOYMENT/CHANGELOG/FEATURES all match the code.

## Intentional exclusions

Verified deliberate — do not "fix": Sentry and Google Analytics are DSN/measurement-gated and off by default (`src/lib/sentry.ts:34`, `src/env.ts:7`); push-delivery alerting is manual by design on the free tier (`docs/OBSERVABILITY.md:15-29`); the illegal-material scanner was removed because the only provider is paid (`DEPLOYMENT.md:128-131`, `CHANGELOG` 2026-09-24); image uploads ship off by default to hold hosting at near-zero cost; `verify_jwt = false` + shared secret for the DB-trigger and scheduler functions is intentional; offline behavior is a cached shell with per-view empty/error states; iOS push requires Add-to-Home-Screen; abuse throttling (issues #236/#552) is a known deferral and non-blocking for a gated launch (P2 #4).

## Suggested execution order

1. **P1 #3** — cut the actual release: bump to `1.0.0`, add release notes, tag `v1.0.0`, surface the version, and tighten the AGENTS.md release rule. Do this last, on the announcement commit.
2. **P1 #1** — add the `delete-account` deploy step to DEPLOYMENT.md (and optionally declare it in `config.toml`); verified self-host GDPR path.
3. **P1 #2** — correct the `ALLOWED_ORIGINS` documentation (required for non-default origins; gates upload + delete + push).
4. **P1 #4** — decide the free-tier backup story (scheduled dump workflow or an honest doc + drill cadence).
5. **P2 #1, #2, #5** — one small docs/example cleanup pass (Sentry row, `test:e2e`, placeholder controller identity).
6. **P2 #3, #4** — state the free-tier observability and abuse-deferral reality in the ops docs / release notes.
