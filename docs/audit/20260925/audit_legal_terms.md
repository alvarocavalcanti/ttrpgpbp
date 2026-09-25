# Legal Terms & Trust-Safety Compliance Audit — 2026-09-25 (Final pre-release)

## Audit Prompt

> You are a privacy/trust-and-safety compliance reviewer writing ONE audit report for a pre-public-release FINAL audit. This is a hobby, zero-revenue, non-commercial TTRPG service (operator = an individual). Not legal advice; compliance-readiness review.
>
> Read-only. Do NOT modify code, run `gh`, or run tests/builds/DB commands. The orchestrator ran the full suite already. Every finding cites verified `file:line`. No evidence = no finding.
>
> Mirror `docs/audit/20260920/audit_legal_terms.md` structure. Severity: P0 = legal/launch blocker · P1 = significant compliance gap · P2 = copy/polish.
>
> Context: the 2026-09-20 round left 1 P1 (CSAM detection had no report/operator-alert path; Terms §7 unbacked) and 4 P2s (#13 ToS acceptance unrecorded, #14 age-gate attestation-only, #15 no controller identity, #16 retention undisclosed). Since then PR #600 removed the paid CSAM scanner in favour of "store unscanned, rely on player reports reviewed by admin", rewrote Terms §6/§7 and the Privacy Policy, bumped `CURRENT_TERMS_VERSION` to `2026-09-24`, and added migration `20260924164257_drop_upload_scanning.sql`. The operator's launch decision is **uploads enabled, report-only moderation**. Re-verify the earlier fixes in code and judge whether the shipped copy, flows, and code are consistent with that decision and whether any missing player-facing disclosure, dead promise, or unbacked safety claim blocks a public Go.

---

**Date:** 2026-09-25
**Scope:** Final pre-release legal / trust-and-safety surface — Terms of Service (`src/features/auth/TermsPage.tsx`) and Privacy Policy (`src/features/auth/PrivacyPage.tsx`) accuracy, the 16+ age gate and its server-side evidence, terms acceptance + version + re-consent, controller identity, retention disclosure, the image-upload posture under the "uploads enabled, report-only moderation" launch decision, the abuse-report → System-thread → admin-resolve loop, GDPR erasure/export, and telemetry (GA4, Sentry) disclosures.
**Verification:** Read-only source, migration, edge-function, and documentation review. No commands were run in this audit (the orchestrator ran the full test/build suite); all claims below are grounded in the cited `file:line`. No remote/production environment was inspected, so environment-set values (e.g. `VITE_GA_MEASUREMENT_ID`) are judged only where the repository itself evidences them.

---

## Executive Summary

**The report-only pivot is honest and internally consistent — no dead CSAM-scanning promise survives in the shipping policy copy.** Terms §6 and the Privacy Policy now state plainly that uploads are **not** scanned (`TermsPage.tsx:102-103`, `PrivacyPage.tsx:50-51`, `CHANGELOG.md:19`), and the paid scanner is fully removed from code, config, and edge functions (`20260924164257_drop_upload_scanning.sql:22`; `supabase/functions/` has no `scan-upload`; `supabase/config.toml:33-39`). The prior P1 is genuinely closed by scope change: with no detection there is no detection-without-report path, and the new report → System-thread → admin loop (`20260921171132_system_message_thread.sql`) gives the operator the awareness that Terms §7's "if we become aware … we will report" is conditioned on. All four prior P2s are fixed in code, with one residual.

**No P0.** Two P1s remain, both narrow and cheap to fix. (1) The Privacy Policy promises "images under review are kept for as long as needed for moderation and legal reporting", but `cleanup-images` prunes every image older than the retention setting with **no hold on reported content** — latent while retention is the default `0` (keep forever), real the moment the operator sets a retention window, which is the whole point of that setting. (2) If the production build sets `VITE_GA_MEASUREMENT_ID` (the 2026-09-23 changelog says visit statistics went live), Google Analytics loads with **no prior-consent gate** and sets cookies; the app has no cookie banner and the Privacy Policy calls the stats "anonymous" while also disclosing IP-derived location.

**Four P2s.** A pre-existing account that accepts via the re-consent gate never stamps `age_verified_at` (the terms fix re-opened an age-skip path); uploads ship disabled by default while the launch decision is enabled (an undocumented manual toggle step); historical changelog entries still claim uploads are scanned; and the GDPR export omits the newly recorded consent/age evidence.

---

## Prior findings disposition

| Prior finding (2026-09-20) | Status | Evidence / note |
| --- | --- | --- |
| **P1 #1** — CSAM detection had no report/operator-alert path; Terms §7 unbacked | **[INTENTIONAL]** superseded | Scanner removed, not reporting wired: `supabase/migrations/20260924164257_drop_upload_scanning.sql:22` (drops `content_hashes`); no `scan-upload` function remains; `upload-image/index.ts:34-36` states uploads are unscanned. With no detection path there is no detect-but-don't-report gap. Report → operator alert loop now exists: `abuse_reports` trigger → `post_system_message()` → single admin-only System thread (`20260921171132_system_message_thread.sql:164-234`), counted in the unread badge (`:280-313`). Residual: the alert is a generic "New abuse report" with no CSAM-specific filing prompt — acceptable for a manual-filing posture, but see Intentional exclusions. |
| **P2 #13** — ToS acceptance never recorded | **[FIXED]** | `profiles.terms_accepted_at` + `terms_version` with a transaction-marker write guard and self-only `confirm_terms()` (`20260922190814_terms_acceptance.sql:13-89`); `CURRENT_TERMS_VERSION = '2026-09-24'` (`terms.ts:5`); sign-in checkbox records the exact version (`LoginPage.tsx:94-103,137-142`); `AuthContext` stamps only from that evidence (`AuthContext.tsx:168-187`); `ReConsentGate` gates stale/never-accepted accounts (`ProtectedRoute.tsx:57-99`). |
| **P2 #14** — Age gate attestation-only; Terms §13 over-promised | **[FIXED]** (copy) | Terms §13 now states the reality: "We rely on your confirmation that you meet the minimum age: we do not verify age and do not collect a date of birth" (`TermsPage.tsx:207`). The Brazil parental-consent line is framed as the user's obligation, not a system feature (`:205-206`). Residual evidence gap tracked as P2 #1 below. |
| **P2 #15** — No controller identity or contact (GDPR Art 13) | **[FIXED]** | `DataControllerLine` rendered in both documents (`DataController.tsx:6-26`, `TermsPage.tsx:214`, `PrivacyPage.tsx:179`); a production build fails without `VITE_CONTROLLER_NAME`/`VITE_CONTROLLER_EMAIL` (`env.ts:14-19`); `DEPLOYMENT.md:48-49` documents it. |
| **P2 #16** — Retention periods undisclosed | **[FIXED]** (but see P1 #1) | Privacy "How long we keep things" now discloses default-indefinite image retention, no auto-scan, and report/review retention (`PrivacyPage.tsx:48-53`). The 90-day hash window is gone with the table. The "images under review are kept" clause is not implemented — flagged as P1 #1. |

---

## P0

None.

---

## P1

### 1. Reported / under-review images are not actually retained — `cleanup-images` has no hold [NEW]

**Evidence:** `src/features/auth/PrivacyPage.tsx:48-53` — "Uploaded images are kept according to the server's retention setting — indefinitely by default. Uploads are not automatically scanned. **Abuse reports and images under review are kept for as long as needed for moderation and legal reporting.**" The cleanup job does not implement that last sentence: `supabase/functions/cleanup-images/logic.ts:99-100` returns early only when retention is `0`; otherwise `collectExpiredImages` (`:130-136`) selects **every** object older than the cutoff and the loop deletes it in batches (`:102-126`), via `removeImages` (`supabase/functions/cleanup-images/index.ts:104-113`). A grep of the whole function for any report/review/hold linkage returns nothing. The dropped-scanning migration's own summary confirms the job still "keeps pruning stored objects by `image_retention_days`" (`20260924164257_drop_upload_scanning.sql:16`).

**Problem:** The Privacy Policy makes a retention promise that the code can violate. While `image_retention_days` is the default `0` (`20260815153348_add_image_retention_days.sql:4`; `SCHEMA.md:137`) nothing is pruned and the sentence holds. But the setting exists precisely to delete old images for cost, and the moment it is non-zero an image that is the subject of an open abuse report — including a report of suspected CSAM, which the operator is expected to report under Terms §7 — can be deleted before or during review, destroying the evidence the moderation and legal-reporting process depends on. There is no "under review" state anywhere in the system, so the claim is currently aspirational.

**Fix:** Either (a) exempt reported images from cleanup: resolve open `abuse_reports` to their `message_id` → attached image object path and skip those objects until the report is terminal (`resolved`/`dismissed`); or (b) narrow the copy to what the code does — e.g. "Images are deleted after the configured retention period; abuse-report records are kept for as long as needed for moderation and legal reporting" — and accept that images are subject to the retention window. Prefer (a): the report-only posture leans on retention as the evidence store.

**Effort:** Copy-only ~15 min; hold implementation ~0.5 day (one query in the cleanup `listImages`/filter step, plus a vitest case and a pgTAP/edge test).

### 2. Analytics loads with no consent gate; the Privacy Policy calls GA "anonymous" [NEW]

**Evidence:** `src/lib/analytics.ts:22-49` injects `gtag.js` and calls `gtag('config', id, { send_page_view: false })` whenever `VITE_GA_MEASUREMENT_ID` is set — no consent check, no Consent Mode, no cookie flags. `trackPageView` sends the pathname only (`:61-66`). The Privacy Policy discloses GA as "**anonymous** page-view statistics" while in the same bullet admitting "Google Analytics also records standard browser and device details, session counts, and an approximate location derived from your IP address" (`PrivacyPage.tsx:131-135`). A repository-wide search finds no consent banner or cookie handling (`src/` has no `CookieBanner`/`CookieConsent` and no cookie section in the Privacy Policy). `docs/CHANGELOG.md:63` states the visit statistics "work now … [they] are real for the first time", i.e. GA is expected to be live in the deployed instance.

**Problem:** If the production build sets `VITE_GA_MEASUREMENT_ID` (the repository gives every indication it does), GA4 sets first-party cookies and processes IP-derived location without prior consent. That breaches the EU cookie-consent rules and is inconsistent with the GDPR-forward posture of the policy (which names the Irish DPC as supervisory authority). Separately, describing the processing as "anonymous" understates it: GA4's client identifiers and IP-derived location are personal data. For a zero-revenue hobby instance the cheapest correct answer may simply be to not collect analytics.

**Fix:** Pick one and make copy match: (a) **cheapest** — do not set `VITE_GA_MEASUREMENT_ID` on the public instance, so `initAnalytics()` no-ops and no cookies are set; or (b) add a prior-consent gate before `initAnalytics()` runs (or Google Consent Mode with analytics denied until consent) and add a short "Cookies and local storage" paragraph disclosing `_ga` and the functional keys (`age-confirmed`, `terms-agreed-version`, `theme`, `changelog:seen`). In both cases drop the word "anonymous" from the GA bullet.

**Effort:** Copy + build-env decision ~15 min; consent gate ~0.5 day.

---

## P2

### 1. Age attestation is skipped by the re-consent path for pre-existing accounts [OPEN]

**Evidence:** The re-consent gate's accept handler calls only `confirmTerms` and `refreshProfile` (`ProtectedRoute.tsx:89-99`); it never calls `confirmAge`. The age stamp runs only when the per-device sign-in checkbox was ticked (`AuthContext.tsx:150-158` guards on `localStorage.getItem('age-confirmed') === 'true'`), and that key is set only in `LoginPage.handleAgeChange` (`LoginPage.tsx:94-103`). Accounts that predate both gates were deliberately left with `age_verified_at = NULL` (`20260917162133_age_verified_at.sql:1-6`).

**Problem:** A pre-existing account (`age_verified_at NULL`, `terms_version NULL`) that keeps an existing session is shown the re-consent gate, accepts the terms, and is let in — **without ever attesting 16+**. Its `age_verified_at` stays `NULL` permanently. So the Privacy Policy's "When you confirm you meet the minimum age, we record the date of that confirmation" (`PrivacyPage.tsx:23-26`) is not true for this cohort, and the 2026-09-22 terms fix quietly re-opened an age-evidence gap the age gate had otherwise handled well. (New sign-ups are fine: the login checkbox stamps both.) No P0 — the gate is attestation-only by design — but the recorded evidence set is incomplete.

**Fix:** Make the re-consent gate collect both consents: render the same "I am at least 16 years old" attestation in `ReConsentGate` and call `confirmAge()` alongside `confirmTerms()` on accept. Alternatively document that pre-gate accounts have no age record, but the one-screen fix is cheap.

**Effort:** Small — `ReConsentGate` checkbox + `ProtectedRoute` `onAccept` calling `confirmAge()`, plus tests. ~0.5 day.

### 2. Uploads ship disabled by default; the launch decision is "enabled" [NEW]

**Evidence:** `image_uploading_enabled` is inserted as `'false'` and never flipped by any migration (`20260814194631_add_channel_avatar.sql:41-46`; confirmed — the only other references are reads in `upload-image/logic.ts:66-72` and `AdminView.tsx:104`). The admin console default mirrors it (`AdminView.tsx:104`; `SCHEMA.md:135`). The launch decision is uploads **enabled**, report-only moderation.

**Problem:** A fresh production database has uploads **off** until an operator manually toggles "allow image uploads" in the admin Settings tab. The default is the safe direction (no unscanned uploads), but the launch decision therefore rests on an undocumented post-deploy step; if it is missed, the launched instance silently differs from the decision and from the Terms/Privacy copy that describe upload behavior. This is a launch-readiness gap, not a legal defect.

**Fix:** Record the toggle as an explicit release step (a line in `DEPLOYMENT.md`, or an operator-run `UPDATE app_settings SET value='true' WHERE key='image_uploading_enabled'` in the release checklist). Keep the code default off for self-hosted deployments, as the 2026-09-24 changelog already advises.

**Effort:** Documentation/ops, minutes.

### 3. Historical changelog still claims uploads are scanned [NEW]

**Evidence:** `docs/CHANGELOG.md:85-87` — "**Safer image sharing** — every uploaded image is now checked against known illegal material before it is stored. If something matches, the upload is blocked and the account is suspended automatically." `:54` — "…when someone files an abuse report, **or an uploaded image is blocked by the safety scan**…". The changelog is rendered in full by the `/changelog` page (`src/features/changelog/changelog.ts:25-59`); the What's New modal only takes the 5 most recent items (`useChangelog.tsx:29`), so it is unaffected.

**Problem:** Players who open the full changelog read obsolete safety claims that directly contradict the current Terms §6 ("There is no automated scanning of uploads", `TermsPage.tsx:102-103`). The 2026-09-24 entry corrects the present tense, but the two historical lines above remain as fact statements.

**Fix:** Amend the two historical lines (e.g. append "*(removed 2026-09-24 — see that entry)*") or drop the obsolete clause; do not rewrite the history itself. Copy-only.

**Effort:** Minutes.

### 4. GDPR export omits the newly recorded consent / age evidence [NEW]

**Evidence:** The export's profile shape and query fetch only `display_name, avatar_url, created_at` (`exportUserData.ts:18-22` and `:76-80`). The schema now also stores `terms_accepted_at`, `terms_version` (`20260922190814_terms_acceptance.sql:13-15`) and `age_verified_at` (`20260917162133_age_verified_at.sql:8`). The Privacy Policy tells users to use "Download My Data" to exercise access/portability (`PrivacyPage.tsx:164-166`).

**Problem:** A data-subject access request returns an incomplete record — the user cannot see the consent/attestation timestamps the app holds about them, which are exactly the records this round added. Small but concrete Art 15 completeness gap.

**Fix:** Add `age_verified_at`, `terms_accepted_at`, and `terms_version` to the profile select and to `UserDataExport.profile`; extend the export test.

**Effort:** ~15 min including test.

---

## What's sound — do not touch

- **The report-only safety posture is disclosed, not hidden.** Terms §6 states "There is no automated scanning of uploads: images are stored as uploaded and are reviewed only when a player reports them" (`TermsPage.tsx:102-103`); the Privacy Policy repeats it (`PrivacyPage.tsx:50-51`); the edge function and client say the same (`upload-image/index.ts:34-36`, `useImageUpload.ts:22`); `CHANGELOG.md:19` and `FEATURES.md:22` are aligned; `SCHEMA.md:128,145` documents it. No dead "we scan every upload" claim remains in the shipping policy.
- **The report → operator-alert loop is real and wired end to end.** `abuse_reports` insert fires `enqueue_abuse_report_alert()` (`20260921171132_system_message_thread.sql:194-234`), which posts a Markdown alert with reporter/reported/channel links into a single lazily-created admin-only System thread (unique index `:21-22`, SELECT/INSERT policies `:26-30,87-119`); the System thread is counted in the admin unread badge (`get_admin_unread_count` `:280-313`) and rendered as a notice card (`ThreadDetail.tsx:107`); the admin Reports tab lists and resolves reports with an audit row (`20260910120000_admin_abuse_reports.sql:16-90`). Alert bodies escape user-controlled Markdown (`20260921190433_system_alert_escaping.sql:18-32`).
- **Terms acceptance is recorded, versioned, and re-consented properly.** DB-owned evidence with a trigger guard against browser forgery and a self-only `confirm_terms()` (`20260922190814_terms_acceptance.sql:28-89`); the sign-in checkbox names the exact version (`LoginPage.tsx:137-142`); a stale record re-accepts through `ReConsentGate`, and a failed stamp holds the app with a retry rather than rendering protected content (`ProtectedRoute.tsx:57-99`).
- **Controller identity is present and enforced.** `DataController.tsx:6-26`, production build gate `env.ts:14-19`, rendered in Terms and Privacy footers (`TermsPage.tsx:214`, `PrivacyPage.tsx:179`).
- **Retention is disclosed.** `PrivacyPage.tsx:48-53` (subject to the P1 #1 caveat). The obsolete 90-day hash window is gone with the dropped table.
- **Telemetry disclosure matches the code.** Sentry masks all text in replays and scrubs query strings from URLs/breadcrumbs (`sentry.ts:12-49`), session-replay sampling is 10% (`:46`) matching the Privacy bullet (`PrivacyPage.tsx:136-140`); GA sends only origin + pathname, stripping query/fragment (`analytics.ts:61-66`).
- **Age-attestation evidence itself is robust.** `confirm_age()` is self-only, idempotent, and trigger-guarded (`20260917162133_age_verified_at.sql:23-72`), and Terms §13 copy now matches the attestation-only reality (`TermsPage.tsx:207`).
- **Account deletion really does erase the account while the message history is anonymized.** `delete-account/index.ts:64-72` deletes the auth user, cascading `messages.sender_id` to NULL and orphaning channels — matching "Your past messages are kept anonymously" (`PrivacyPage.tsx:169-173`), not hand-waving.

---

## Intentional exclusions

- **No DOB / age verification.** Self-attestation is the accepted posture for a non-financial hobby service; P2 #1 is about completing the attestation record, not adding verification.
- **No automated CSAM scan.** Removed for cost (`20260924164257_drop_upload_scanning.sql:1-20`); report-only moderation is the operator's explicit launch decision. The trade-off is disclosed to players.
- **No CSAM-specific operator prompt / no automated NCMEC/INHOPE filing.** Filing stays a human act; the report surfaces in the System thread with links. A dedicated "suspected CSAM — report required" runbook would strengthen this but is not required for the Terms §7 promise to hold.
- **Deferred trust-and-safety work (open issue #552): A1 AUP keyword scan, A2 link reputation.** Report-only moderation is the accepted substitute at launch; Terms §5's "reserve the right — but not the obligation — to monitor" is accurate (`TermsPage.tsx:86-91`).
- **No retroactive ToS clickwrap for accounts that predate 2026-09-22.** The re-consent gate covers stale/never-accepted accounts going forward; pre-existing acceptance cannot be reconstructed.
- **Soft-delete / pseudonymized retention, including image objects attached to anonymized messages.** Images remain in the channel as part of other players' history, consistent with the disclosed message-retention posture.
- **`verify_jwt` / shared-secret boundaries on `cleanup-images` and `push-notifications`** — carried from the security pillar; caller contracts differ and are not a legal concern.

---

## Suggested execution order

1. **P1 #2 — decide analytics at launch.** Cheapest is to not set `VITE_GA_MEASUREMENT_ID` for the public instance; otherwise add a prior-consent gate and a cookies/local-storage paragraph. Also drop "anonymous". Do this before Go.
2. **P1 #1 — back the "images under review are kept" clause.** Prefer the reported-image hold in `cleanup-images`; copy-only is acceptable if the operator commits to leaving retention at `0`.
3. **P2 #1 — stamp the age attestation on the re-consent gate** (one checkbox + `confirmAge()`), closing the pre-existing-account evidence gap.
4. **P2 #2, #3, #4 — one small PR:** the launch toggle step in `DEPLOYMENT.md`, the two changelog line fixes, and the export fields.

No ordering dependency among 2–4. The two P1s are the only items that gate a public Go, and both are small.
