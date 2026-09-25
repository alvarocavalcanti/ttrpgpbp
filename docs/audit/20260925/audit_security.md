# Security & Data Integrity Audit — 2026-09-25

## Audit Prompt

> You are an Application Security Engineer writing ONE audit report for a pre-public-release FINAL audit.
>
> Repo root (a git worktree — treat as repo root): /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-final-release-audit
> Your ONLY output file: docs/audit/20260925/audit_security.md (create the dir if needed).
>
> STRICT RULES:
>
> - READ-ONLY audit: do NOT modify any code, do NOT run gh, do NOT run tests/builds/DB/`supabase` commands. The orchestrator already ran the full verification suite. You MAY read files and run read-only `git`/`grep`/`rg`/`ls`.
> - Every finding MUST cite verified `file:line` evidence. No evidence = no finding. Be rigorous and skeptical — this is the last gate before public release.
> - Mirror the structure of docs/audit/20260920/audit_security.md exactly: title; `## Audit Prompt` blockquote; Date/Scope/Verification lines; Executive Summary; `## Prior findings disposition` table; P0; P1; P2 (each: Evidence / Problem / Fix / Effort); `## What's sound — do not touch`; `## Intentional exclusions`; `## Suggested execution order`.
> - Tag each finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID), or [INTENTIONAL] (deliberate, list under Intentional Exclusions).
> - Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
> - Markdown will be linted by markdownlint-cli2 and spell-checked by cspell; keep it clean, add nothing to configs.
>
> CONTEXT:
>
> - Previous full round = docs/audit/20260920/INDEX.md (0 P0, 0 P1, 3 P2 security). Baselines: docs/audit/20260920/audit_security.md, docs/audit/20260920/INDEX.md, docs/audit/20260907/audit_security.md.
> - ~20 PRs merged since. Security-relevant deltas: PR #600 removed the paid CSAM scanner (scan-upload to upload-image, `content_hashes` dropped); re-verify 20260920 security P2 #1/#3; audit the terms-acceptance, system-alert thread/escaping, dice-favorites, CORS and migration-order changes.
> - Also do a full reconnaissance pass for NEW security issues: RLS policies, SECURITY DEFINER functions and their `search_path`/grants, edge-function auth, storage policies, auth/session handling, GDPR export completeness, XSS/injection (markdown, links, image URLs), SSRF, open redirects, and CSP.
>
> VERIFY: read the actual current migration files, function sources, policies, and tests. Do not trust commit messages or changelogs.

---

**Date:** 2026-09-25
**Scope:** Security & data integrity pillar — re-verification of the 2026-09-20 security P2s (#1 grant-sweep durability, #2 scan-upload quota/bypass, #3 `get_unread_totals`), the scanner removal (#600) and the `upload-image` guards/storage policies it left behind, and the new surface merged since 2026-09-20: the admin System thread (#562 P1), system-alert markdown escaping, terms-acceptance evidence, dice-roll favorites (#586), `delete-account`/`upload-image` CORS, plus a fresh-eyes pass over RLS, SECURITY DEFINER helpers and their grants, edge-function auth, storage policies, GDPR export, markdown/link/image XSS, and CSP.
**Verification commands run:** read-only file review only (`git log`, `git show --stat`, `grep`, `ls`); no code, tests, builds, DB, or `supabase` commands were run. Orchestrator-run suite (not re-run here, per contract): `tsc` 0 errors; oxlint 0 errors / 54 warnings; vitest 1955 passed / 146 files; coverage 93.3 / 85.46 / 90.84 / 96.07; build passed; `lint:md` 0; cspell 0; pgTAP 411 PASS after a clean `supabase db reset`; Playwright E2E 7 passed. Every claim below was verified against the current files at `HEAD` (`c055ca1`).

---

## Executive Summary

**The 2026-09-20 security P2s are genuinely fixed**, and the scanner removal (#600) was executed cleanly: `upload-image` still enforces every server-side gate (JWT identity, `gm_id === user.id`, the `{channel}/{folder}/{uuid}.jpg` path shape, the `image_uploading_enabled`/`image_max_size_mb` settings, and a new JPEG SOI byte check), the `images` bucket has no client write policy, and the DB write guard still clamps size/mimetype/dimensions on the service-role write path. The new System thread, system-alert escaping, terms-acceptance guard, and dice-favorites table are all `search_path`-pinned, least-privilege, and pgTAP-covered.

**One P1 and five P2s remain.** The P1 is an authorization gap on the new admin-comms surface: the `admin_messages` INSERT policy mirrors the announcement *read* audience, so **any non-suspended user can post into a global announcement thread, and the `AFTER INSERT` push trigger then fans that user-authored content out to every user as an "Announcement" notification** — a mass-notification / impersonation vector. The P2s are hardening: the upload volume cap died with `content_hashes` and nothing replaced it (the paid-provider concern is moot, but the storage-exhaustion equivalent is not), abuse reports have no de-duplication so a member can flood the admin System thread and its pushes, the GDPR export omits the new `dice_roll_favorites` table, `delete-account` fails open if the `is_server_admin` RPC errors, and `profiles` is still readable by `anon` and now exposes terms-acceptance columns.

Nothing here is a data-loss or credential-exposure defect. Ship the P1 with the announcement-reply fix, then the P2 batch as one chore PR.

---

## Prior findings disposition

| # | Finding | Status | Evidence (current state) |
|---|---|---|---|
| 1 | Grant-sweep durability: post-sweep SECURITY DEFINER triggers shipped without a revoke | **[FIXED]** | `supabase/migrations/20260920182740_audit_20260920_grant_hardening.sql:14-21` revokes `enforce_abuse_report_integrity`, `enforce_abuse_report_immutable_report_target`, `handle_email_opt_in_change` from all four roles; the sweep pgTAP now carries a class-level guard so *every* `RETURNS trigger` function in `public` must be un-executable by `authenticated`/`service_role` (`supabase/tests/20260905141623_sec1_grant_sweep.sql:246-271`). New trigger helpers since (`escape_markdown`, `enforce_dice_favorite_cap`, `handle_terms_acceptance_change`) each ship the house revoke (`20260921190433:35-36`, `20260923164100:59-60`, `20260922190814:53-54`). |
| 2 | `scan-upload` quota cap defeatable by object-path reuse; no size bound before the scan | **[SUPERSEDED]** | The scanner and `content_hashes` are gone (`supabase/migrations/20260924164257_drop_upload_scanning.sql:22`), so the paid-provider burn and the pre-scan byte gap no longer exist. The *binding* it provided is also gone, and no equivalent exists — tracked as P2 #1 below (unbounded upload volume). |
| 3 | `get_unread_totals` retains `authenticated` EXECUTE and takes arbitrary user ids | **[FIXED]** | `supabase/migrations/20260920182740_audit_20260920_grant_hardening.sql:30-32` revokes it from `PUBLIC, anon, authenticated` and re-grants only `service_role`; asserted at `supabase/tests/20260905141623_sec1_grant_sweep.sql:376-380`. |
| 4 | CSAM detection had no report/operator-alert path (2026-09-20 legal P1) | **[SUPERSEDED / INTENTIONAL]** | The detection feature was removed rather than completed: no scan, so no detection-without-report path (`20260924164257_drop_upload_scanning.sql:1-19`). Reports reviewed by the admin are now the sole safety net, matching the updated Terms §7 (`src/features/auth/TermsPage.tsx`). |
| 5 | 2026-09-07 security findings #1–#5 | **[FIXED — carried]** | Re-spot-checked: `get_user_channels_unread` self-guard (`20260915122559:34-43`), NPC avatar scheme trigger (`20260907094614`), `mark_admin_thread_read` participation gate (`20260921171132:245-271`), SW same-origin URL re-check (`src/sw.ts:154-167`), and the durable default-privilege pin (`20260907200109`). No regression. |

---

## P0

None.

---

## P1

### 1. Any user can post into a global announcement thread and fan it out to every user as an "Announcement" push [NEW]

**Evidence:**

- `supabase/migrations/20260921171132_system_message_thread.sql:87-119` (and its predecessor `supabase/migrations/20260909145247_admin_messages_all_users.sql:117-145`) — the `admin_messages` INSERT policy is a copy of the announcement *read* predicate: for `type = 'announcement'` with `audience = 'all_users'` it passes for **any** non-suspended caller (`NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_suspended)`), with the only other condition being `sender_id = auth.uid()`.
- `src/features/admin-messages/useAdminMessages.ts:154-166` — the reply composer inserts straight into `admin_messages` as the signed-in user; `src/features/admin-messages/ThreadDetail.tsx:145-174` renders that reply form for every thread type (no announcement gate), and `src/features/admin-messages/AdminMessagesView.tsx:6-9` exposes the view to every signed-in user.
- `supabase/migrations/20260821160948_20260821000000_admin_gm_comms.sql:226-229` — `on_admin_message_inserted_push` is an unconditional `AFTER INSERT` trigger on `admin_messages`; it calls `handle_new_message_notification` (`:196-224`), which POSTs `{table:'admin_messages', message_id}` to the push function.
- `supabase/functions/push-notifications/index.ts:217-231` — for `announcement`/`all_users` the function resolves the target list to *every* non-suspended profile, and `:282-292` builds the event with `content: message.content`; `supabase/functions/push-notifications/filter.ts:114-127` titles it `Announcement: <subject>` and sets `body = plainBody(event.content)`. The only exclusion is the sender (`filter.ts:115`).
- pgTAP covers announcement *read* visibility only — no test inserts as a regular player (`supabase/tests/20260909150000_issue_466_messages_audiences.sql:142-170` tests DM inserts, not announcements).

**Problem:** A regular player (any authenticated non-suspended account) can insert a row into an `all_users` announcement thread and thereby (a) inject user-authored content into the shared announcement thread that every user reads, and (b) trigger a push notification, titled as an official announcement, to the entire non-suspended user base with attacker-controlled body text. That is a broadcast/impersonation abuse vector: one account can spam or phish every user at once, and each reply multiplies the admin's announcement thread. No data leaves the system and no content is exposed that the caller could not already see; the harm is unauthorized mass messaging and integrity of the official announcement channel.

**Fix:** In the `admin_messages` INSERT policy, gate the `announcement` branch on `is_server_admin()` (drop the audience-parity branch for INSERT); keep the audience predicate only in SELECT. Optionally add a defense-in-depth trigger that rejects non-admin inserts into `announcement`/`system` threads. Add a pgTAP case asserting a regular player cannot insert into an announcement thread (and a GM cannot insert into a `gms` announcement unless it stays admin-only by design). If user discussion on announcements is intended, it must not route through the admin push trigger.

**Effort:** One migration + one pgTAP case. Half a day.

---

## P2

### 1. Upload volume is now unbounded — the hourly cap died with the scanner and nothing replaced it [NEW]

**Evidence:**

- `supabase/migrations/20260924164257_drop_upload_scanning.sql:1-22` — drops `content_hashes` and states outright that the per-hour upload cap "existed only to bound paid provider quota" and is gone; the only surviving server-side gates are the admin toggle, the size cap, the path shape, and GM-of-channel.
- `supabase/functions/upload-image/index.ts:96-118` — the function checks settings + `image_max_size_mb` per file, empty bytes, and the JPEG SOI signature; there is no per-user/hour or per-channel object-count limit anywhere.
- `src/hooks/useImageUpload.ts:44` — each upload mints a fresh `crypto.randomUUID()` path, so repeated uploads never collide and `upsert: false` never blocks a new object.
- `supabase/functions/cleanup-images/logic.ts:99-100` — retention defaults to 0, i.e. cleanup is a no-op until the operator sets `image_retention_days`, so uploaded objects accumulate permanently by default.
- `supabase/migrations/20260814194631_add_channel_avatar.sql:44-46` — `image_uploading_enabled` defaults to `false`, which is the operator's only blunt mitigation (disable all uploads).

**Problem:** 2026-09-20 security P2 #2 is moot as written (no paid provider is billed), but the equivalent abuse path survives: a channel GM — a role any user can obtain by creating a channel, bounded only by `max_channels_per_user` — can upload arbitrarily many (up to `image_max_size_mb`, default 5 MB) JPEGs into their channel's folder. The `images` bucket has no object-count or total-size cap and cleanup keeps everything by default, so a single GM can exhaust the free-tier storage quota, after which all users' uploads fail (and, on a metered project, incur cost). No data-integrity impact: every object is still size/mimetype/dimension-gated and stored only by the service-role function.

**Fix:** Reinstate a cheap bound that does not need a provider: count objects (or bytes) per channel/user in `upload-image` before storing (a `storage.objects` count via the service client, or a small counter table), and/or enforce a per-channel object cap with a periodic prune. At minimum, document that operators should set a non-zero `image_retention_days`. Add a vitest case for the cap.

**Effort:** ~30 lines + a test. Half a day.

### 2. Abuse reports have no de-duplication or rate limit — a member can flood the admin System thread and its pushes [NEW]

**Evidence:**

- `supabase/migrations/20260819130000_abuse_controls.sql:85-96` — `abuse_reports` has no unique constraint and no per-reporter throttle; the only INSERT gate is `reporter_id = auth.uid()` (`:99`).
- `supabase/migrations/20260921171132_system_message_thread.sql:230-234` — an `AFTER INSERT` trigger (`enqueue_abuse_report_alert`) runs for every report; its body calls `post_system_message` with the reporter/reported names and the reason, so each report creates a row in the admin System thread.
- `supabase/migrations/20260821160948_20260821000000_admin_gm_comms.sql:226-229` — the same `admin_messages` insert fires the push trigger, so each report also pushes to the server admin.
- `supabase/functions/push-notifications/index.ts:253-266` — system alerts route only to the admin (correct), but every report is a separate push.

**Problem:** A member of any channel can call the reports insert endpoint repeatedly for the same message and flood the admin's System thread and push tray — the very inbox that carries safety alerts. There is no unique `(reporter_id, message_id)` constraint and no rate limit, so the safety channel can be buried in noise, degrading the moderation path #562 was built to strengthen. No content exposure or data loss.

**Fix:** Add a unique constraint on `(reporter_id, message_id)` (reject duplicate reports with a friendly error), and/or a lightweight per-reporter windowed throttle mirroring the `join_channel` failure window; coalesce repeated alerts for one message into the existing thread row. Add pgTAP for the duplicate-rejection path.

**Effort:** One migration + test. Half a day.

### 3. GDPR export omits `dice_roll_favorites` (and the terms-acceptance fields) [NEW]

**Evidence:**

- `supabase/migrations/20260923164100_dice_roll_favorites.sql:5-16` — `dice_roll_favorites (user_id, channel_id, notation, created_at)` is user-authored personal data, created after the export was last extended.
- `src/features/auth/exportUserData.ts:16-67` and `:132-158` — the export shape and returned object contain profile, memberships, messages, dice rolls, reactions, notification preferences, abuse reports, and authored admin messages; there is no `dice_roll_favorites` section.
- `supabase/migrations/20260922190814_terms_acceptance.sql:13-15` — `profiles.terms_accepted_at` / `terms_version` were added after the export's profile projection (`src/features/auth/exportUserData.ts:76-80` selects only `display_name, avatar_url, created_at`), so the recorded acceptance evidence is not in the export either.

**Problem:** The right of access / portability export is incomplete for data the user authored after the last extension. Favorites are actively stored personal data; terms-acceptance timestamps are the user's own record. Low sensitivity, but a GDPR completeness gap the app otherwise takes seriously.

**Fix:** Add a `dice_roll_favorites` query (scoped `user_id = userId`) and a `dice_roll_favorites` section to `UserDataExport`; include `terms_accepted_at`/`terms_version` in the profile projection. Extend `exportUserData.test.ts` to assert both.

**Effort:** ~20 lines + tests. Under an hour.

### 4. `delete-account` treats an `is_server_admin` RPC error as "not admin" — fail-open on the sole-admin guard [NEW]

**Evidence:**

- `supabase/functions/delete-account/index.ts:55-59` — `const { data: isServerAdmin } = await userClient.rpc("is_server_admin")` reads only `data`; the `error` is ignored, and `evaluateDeletion(isServerAdmin === true)` treats any non-`true` result (including an RPC failure) as a normal user.
- `supabase/functions/delete-account/logic.ts:10-19` — the guard exists solely to stop the single `server_admin` (partial unique index) from deleting themselves and leaving the app without an admin.

**Problem:** If the `is_server_admin` RPC fails (transient 5xx/network), the guard fails open and `serviceClient.auth.admin.deleteUser` proceeds, so the sole admin can self-delete by accident. The blast radius is limited (self-inflicted, no privilege escalation, no third-party data loss), but a security guard should fail closed.

**Fix:** Destructure `error` and return a `500` (or `503`) when the RPC errors, before calling `evaluateDeletion`. Add a unit test for the error branch.

**Effort:** ~5 lines + a test. Under an hour.

### 5. `profiles` stays readable by `anon` and now exposes the terms-acceptance columns [NEW]

**Evidence:**

- `supabase/migrations/20240801000000_init_schema.sql:17-18` — `CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true)`; with no `TO` clause it applies to `PUBLIC`.
- `supabase/migrations/20260905195245_add_table_dml_grants.sql:10` — `GRANT SELECT ... ON ALL TABLES IN SCHEMA public TO anon, authenticated`, so the `anon` role (any holder of the public anon key, unauthenticated) can read `profiles`.
- `supabase/migrations/20260812170000_hide_sensitive_profile_fields.sql:65` — the only column-level hardening revokes `server_admin` from `authenticated`; `email` was dropped, but all other columns remain readable.
- `supabase/migrations/20260922190814_terms_acceptance.sql:13-15` adds `terms_accepted_at`/`terms_version`; `supabase/migrations/20260819130000_abuse_controls.sql:7` and `supabase/migrations/20260909145248_email_opt_in_consent.sql:9-10` add `is_suspended`, `email_opt_in`, `email_opt_in_at`.

**Problem:** An unauthenticated caller can enumerate every account's `display_name`, `avatar_url`, `created_at`, suspension status, email opt-in flag, and (new) terms-acceptance timestamps via PostgREST, and any authenticated user can read the same across all accounts. The app needs cross-user display names/avatars, but not unauthenticated access and not the newer personal columns. Low-sensitivity data, but it is a real unauthenticated read of personal data introduced/expanded by migrations merged since the last round.

**Fix:** `REVOKE SELECT ON public.profiles FROM anon;` (the marketing shell never reads profiles pre-login). Separately, scope the newer columns away from `authenticated` cross-user reads — simplest is a self-only RPC or a view for the self profile and `REVOKE SELECT (is_suspended, email_opt_in, email_opt_in_at, terms_accepted_at, terms_version) ON profiles FROM authenticated` once the client's self-read path is moved behind it. Assert the anon revoke in pgTAP.

**Effort:** One small revoke migration; the column scoping is a follow-up. Under an hour for the anon revoke.

---

## What's sound — do not touch

- **`upload-image` guards are complete for what remains** (`supabase/functions/upload-image/index.ts`): identity resolved from the verified JWT (`:55-69`), `gm_id === user.id` against the channel read with the service client (`:84-91`), the `{channel}/{folder}/{uuid}.jpg` path shape with `match[1] === channelId` (`logic.ts:46-52`), the admin toggle + size cap checked before the bytes are buffered and fail-closed on a settings read error (`index.ts:96-110`), and the JPEG SOI byte check (`index.ts:112-118`, `logic.ts:89-91`).
- **The `images` bucket has no client write path**: `images_insert`/`images_update` are dropped (`20260917171310_restrict_image_writes_to_scan_upload.sql:23-24`) and `enforce_image_upload_rules` still fires on the service-role write, enforcing enablement, size, `image/*`, and 1..20000 dimension clamping (`20260914160000_clamp_image_dimension_metadata.sql:10-76`, revoked from all roles at `:75-76`). Reads are membership- or admin-gated (`20260917163229:153-162`), and `images_delete` remains GM-only (carried exclusion).
- **System thread isolation** (`20260921171132_system_message_thread.sql`): admin-only SELECT/INSERT for `type = 'system'` (`:26-30`, `:76-79`, `:113-116`), the `admin_threads` CHECK requires `subject NOT NULL AND gm_id IS NULL AND audience IS NULL` (`:12-17`), `get_or_create_system_thread` is revoked from all API roles (`:157-158`), and `post_system_message` is `service_role`-only with a pinned `search_path` (`:164-189`).
- **System-alert escaping**: `escape_markdown` backslash-escapes every markdown control character before interpolating user names/channel names/reason, and alert delivery is best-effort so a failed alert cannot roll back the durable report row (`20260921190433:19-75`); pgTAP covers the escaping (`supabase/tests/20260921190433_system_alert_escaping.sql:15-35`). ReactMarkdown does not parse raw HTML, so `<`/`&` need no escaping.
- **Terms-acceptance evidence is DB-owned**: `handle_terms_acceptance_change` reverts direct client writes unless the transaction-local `app.terms_confirmation` marker is set (`20260922190814:28-49`), `confirm_terms` is self-only, `SECURITY DEFINER`, `search_path`-pinned, version-capped, and granted to `authenticated` only (`:58-89`), with pgTAP for immutability and validation (`supabase/tests/20260922190814_terms_acceptance.sql`). Device consent flags are cleared on sign-out and on identity switch (`src/features/auth/AuthContext.tsx:92-98,207-216`).
- **Dice-roll favorites**: own-row RLS with a membership `WITH CHECK`, a server-side 3-per-channel cap trigger that is `SECURITY DEFINER` and revoked (`20260923164100:18-60`), and a DB-level notation-format CHECK (`:13-14`).
- **CORS on `upload-image`/`delete-account`**: origin is echoed only when allowlisted, defaults are the deployed origins plus `*.ttrpgpbp.pages.dev`, and `x-client-info` plus the Supabase client headers are echoed (`supabase/functions/upload-image/logic.ts:12-40`, `supabase/functions/delete-account/logic.ts:33-60`). CORS is not the auth boundary; the JWT is.
- **`delete-account` auth shape** (apart from P2 #4): identity from the verified JWT, service-role deletion of only `user.id`, `verify_jwt` defaults to true.
- **`cleanup-images`**: POST-only, constant-time hashed secret compare, secret-gated (`supabase/functions/cleanup-images/index.ts:9-46`), and the scheduled workflow uses `permissions: {}` (`.github/workflows/cleanup-images.yml:13`).
- **Push pipeline routing**: system alerts go to the admin only, announcements by audience, DMs to the non-sender participant (`supabase/functions/push-notifications/index.ts:216-280`), bodies are markdown-stripped and length-capped, and whisper bodies stay content-free (`filter.ts:69-100,154-169`).
- **Client telemetry**: only the anon key ships (`src/lib/supabase.ts`), env is Zod-validated, Sentry masks all replay text and scrubs URLs (`src/lib/sentry.ts:41-43,22-31`), GA reports pathname only (`src/lib/analytics.ts:75-80`), and the SW re-validates the push click URL as site-relative (`src/sw.ts:145-168`, `src/lib/swPush.ts`).
- **CSP/headers**: `base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'self'` plus `X-Frame-Options: SAMEORIGIN` (`public/_headers:2-3`); `max_rows = 1000` and the function auth contract are documented (`supabase/config.toml:11-39`).
- **Grant hygiene is class-durable now**: the sweep asserts zero `authenticated`/`service_role` EXECUTE on any `RETURNS trigger` function in `public` (`supabase/tests/20260905141623_sec1_grant_sweep.sql:246-271`), and every function added since carries its own revoke.

---

## Intentional exclusions

Carried from `docs/audit/20260920/INDEX.md` and re-verified deliberate — do not "fix":

- **Unscanned uploads** — the paid CSAM scanner was removed (zero-cost constraint); reported images are reviewed by the admin and Terms §7 now promises reporting only for what we become aware of (`supabase/migrations/20260924164257_drop_upload_scanning.sql:1-19`). This is the accepted posture, not a regression to reopen a paid dependency.
- **`verify_jwt = false` + shared secret on `push-notifications`/`cleanup-images`** (`supabase/config.toml:13-31`) — caller contracts differ (DB trigger vs scheduler); secrets are unreadable by API roles. `upload-image` uses `verify_jwt = true` (`:33-39`).
- **Whisper privacy model** — sender + target + GM by RLS; content-free push bodies; received whispers excluded from the export.
- **Client-side PBKDF2 with DB-side compare** (`get_channel_salt` stays authenticated) — plaintext never reaches the DB.
- **Mimetype is label-only plus a JPEG signature check** — no full decode; documented ceiling.
- **CSP `script-src 'unsafe-inline'`** — nonce-ification remains the deferred optional follow-up.
- **X-Card anonymity-by-design**, GM-only resolution, and GM NPC posting.
- **Open signup; distributed brute-force residual** — per-IP limiting unreachable from Postgres; the per-account join throttle is the right scope.
- **Soft-delete-only messages; stale-but-safe previews.**
- **Image retention defaults to 0 (no-op cleanup)** — operator choice; noted as the amplifier in P2 #1.
- **Age gate is self-attestation, not access control** — stated intent (`20260917162133_age_verified_at.sql:1-11`).
- **Admin content reads include whispers + soft-deleted rows and are audited** — explicit moderation intent.
- **Explicit table DML grants** (`20260905195245`, `20260907115918`) — match hosted behavior; RLS is the authority.

New this round (do not "fix"):

- **`delete-account` is deployed by CI but not listed in `supabase/config.toml`** — an unlisted function still deploys with `verify_jwt = true` by CLI default, so the gap is documentation, not auth (release-readiness pillar owns the doc fix).
- **`admin_reports` reason is capped at 1000 and alert bodies are markdown-escaped** — the spam gap is volume/dedupe (P2 #2), not content safety.
- **Storage free-tier exhaustion is bounded only by the admin toggle** — the operator can disable uploads or set retention; the abuse path is documented as P2 rather than a launch blocker.

---

## Suggested execution order

1. **P1 #1** — gate announcement-thread inserts on `is_server_admin()` (or suppress the push fan-out for non-admin senders) + pgTAP. Own PR; it is the only user-facing authorization defect.
2. **P2 #2** — unique `(reporter_id, message_id)` and/or a reporter throttle for abuse reports + pgTAP. Protects the safety inbox.
3. **P2 #1** — reinstate an upload volume bound (per-channel/per-user object or byte cap) that needs no provider; document the retention setting. Protects free-tier storage.
4. **P2 #4** — make `delete-account` fail closed on an RPC error + test.
5. **P2 #5** — `REVOKE SELECT ON profiles FROM anon` + pgTAP; scope the newer personal columns as a follow-up.
6. **P2 #3** — add `dice_roll_favorites` and terms fields to the GDPR export + tests.
7. Batch 2–6 into one or two chore PRs; no ordering dependency, but land P2 #1 before the public announcement so the storage bound is in place from day one.
