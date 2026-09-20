# Legal Terms & Trust-Safety Compliance Audit — 2026-09-20

## Audit Prompt

> You are a privacy & compliance engineer auditing a multiplayer Play-by-Post TTRPG web app (React + Supabase, Google OAuth sign-in, user-generated chat + image content). This is a RESEARCH + REPORT task: you must NOT modify any code. Your ONLY file output is this audit report.
>
> Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260920 (a git worktree).
>
> AUDIT CONTRACT:
>
> - Read-only audit. Do NOT modify any file except this report. Do NOT run `gh` or any git command. Do NOT run tests, builds, or DB commands.
> - Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files (grep/read tools).
> - Every finding cites evidence as `file:line`. No evidence = no finding. Verify against actual code/migrations/policy copy, not changelogs.
> - Severity: P0 = compliance/launch blocker · P1 = significant legal gap, no active harm · P2 = polish/hardening.
> - Scope: the trust-and-safety / legal surface shipped in PRs #547 (safety-focused terms + 16+ age gate), #548 (admin message inspection + scanned image uploads), #553/#550 (server-admin read-only channel access), #557/#556 (server-admin channel roster), plus their follow-up migrations and the pre-existing GDPR/retention posture they build on.
>
> YOUR PILLAR — Legal terms & compliance. Audit end to end:
>
> 0. Terms of Service (`src/features/auth/TermsPage.tsx`): accuracy of every substantive claim against actual behavior (encryption, monitoring, content license, §230 reliance, eligibility, termination).
> 1. Privacy Policy (`src/features/auth/PrivacyPage.tsx`): accuracy vs actual telemetry (GA pathname-only, Sentry maskAllText/scrubbing, Google OAuth scopes, push endpoints), GDPR rights/erasure/export/retention/transfers, Google API Limited Use.
> 2. Age gate (16+): consent capture, server-side evidence (`age_verified_at`, `confirm_age()`), attestation vs verification, parental-consent carve-out, retroactivity for pre-existing accounts.
> 3. Email consent: opt-in evidence pair (`email_opt_in` / `email_opt_in_at`).
> 4. Content moderation / CSAM scan: `scan-upload` edge function + `content_hashes` + image-write restriction + `cleanup-images` — fail-closed posture, and crucially the detection→report path (NCMEC/INHOPE obligation in Terms §7).
> 5. Admin oversight (read-only channel access, message inspection, audit_logs) — does the "who can read what" disclosure match reality; is every content read audited.
> 6. Controller identity & contact channels (GDPR Art 13), ToS versioning/acceptance record.
>
> REPORT STRUCTURE (markdown, this exact skeleton):
>
> 1. `## Audit Prompt` (verbatim).
> 2. Header block: date, scope, verification commands + results.
> 3. `## Executive Summary`.
> 4. `## P0` / `## P1` / `## P2`. Each finding: bold title, tag, evidence file:line, problem, concrete fix, rough effort.
> 5. `## What's sound — do not touch`.
> 6. `## Intentional exclusions`.
> 7. `## Suggested execution order`.

---

**Date:** 2026-09-20
**Scope:** Legal terms & trust-safety compliance — Terms of Service and Privacy Policy accuracy, the 16+ age gate and its server-side evidence, email-consent evidence, the CSAM scan pipeline (detection → reporting), admin content-oversight + audit logging, GDPR erasure/export/retention posture, controller identity & ToS acceptance recording. Covers PRs #547, #548, #553, #557 and their follow-up migrations.
**Verification commands run:**

- `npx tsc -p tsconfig.app.json --noEmit` → **passed** (no errors)
- `npx oxlint` → **passed** (exit 0; 45 react-compiler warnings + 1 jsx-a11y warning, 0 errors)
- Tests/coverage/build run by the orchestrator: **1770 passed / 0 failed**; coverage 92.82% statements / 84.83% branches / 90.4% functions / 95.65% lines; build passed (43 precache entries).
- No DB commands run (per contract). All claims verified by reading migrations, edge functions, pgTAP, and policy copy.

---

## Executive Summary

**The legal surface is unusually honest and largely accurate — but the safety machinery stops one step short of its own promises.** The Terms and Privacy Policy disclose the uncomfortable truths correctly (not end-to-end encrypted, admin + automated systems can read content, §230 reliance, reporting to NCMEC/INHOPE), which is rarer than it should be for a hobby app. The age gate and email-consent evidence are done properly: server-side, self-only, idempotent, trigger-guarded against browser forgery, with pgTAP. GDPR erasure actually anonymizes (`sender_id SET NULL`) rather than pretending, and the export was verified complete in the 20260907 audit.

**One P1.** The CSAM scan pipeline is fail-closed at ingestion but has **no detection→report path**: when a match is found the system suspends the uploader and writes a `csam_match_blocked` audit row, but nothing notifies an operator, files an NCMEC/INHOPE report, or even surfaces the event in a queue (the one admin-facing list RPC was dropped as "unused"). The Terms §7 promise — "we will report it to the appropriate authorities" — has no code behind it. This is latent (the scanner itself is unconfigured, so no detection occurs today), but shipping a safety feature that, once enabled, detects without reporting is a compliance landmine.

**Four P2s.** ToS acceptance is never recorded (the sign-in checkbox records only the *age* attestation, not the terms/privacy consent, with no versioning or re-consent); the age gate is attestation-only with no parental-consent mechanism and no under-16 detection path despite Terms §13 promising deletion; controller identity/contact is absent (GDPR Art 13); and retention periods for hashes/images aren't disclosed.

---

## P0

None.

---

## P1

### 1. CSAM detection has no report or operator-alert path — the Terms §7 promise is unbacked [NEW]

**Evidence:** `supabase/functions/scan-upload/index.ts:177-206` — on a Safer `match`, the function updates `content_hashes` (`:179-183`), inserts an `audit_logs` row with `action: 'csam_match_blocked'` (`:187-195`), suspends the uploader (`:199-205`), then returns `{status:"blocked"}`. That is the entire detection path: **no NCMEC/INHOPE report, no operator notification, no queued review item.** The only admin-facing list of matches, `admin_list_content_matches()` (`20260917163230_content_hashes.sql:31-73`), was deleted as "no client calls it" (`20260918092818_drop_unused_admin_content_rpcs.sql:13-14`). The sole remaining visibility is a label in a *per-user* moderation history (`src/features/admin/UserDetailModal.tsx:35` — `csam_match_blocked: 'Upload blocked and account suspended'`) — an admin only sees it while already inspecting that specific user. Meanwhile `TermsPage.tsx:112-116` promises "we will report it to the appropriate authorities — NCMEC, an INHOPE-member hotline such as Hotline.ie, or equivalent."

**Problem:** Two distinct gaps. (a) The detection engine itself is unconfigured: `scan-upload/index.ts:90-96` refuses every upload (`status:"unavailable"`) until `SAFER_API_KEY` is set, and `logic.ts:36-41` states the Safer response shape "is not confirmed yet" — so today *nothing is scanned* and the feature is a fail-closed scaffold (safe, honest, but not operational). (b) When the operator *does* configure it, a real match — apparent CSAM — leaves the Terms §7 reporting commitment with **zero automated or surfaced path to fulfill it.** Whether a *mandatory* reporting obligation attaches in any given jurisdiction (e.g. 18 U.S.C. §2258A for certain US providers, or DSA-adjacent duties in the EU) depends on the service's legal classification and jurisdictional scope, which this audit does not establish; what it does establish is that the code has no path that performs the reporting the Terms already promise. A silent audit row inside a per-user modal is not a report, and there is no alert to make the operator even look. The Terms are therefore more protective on paper than the system can deliver.

**Fix:** Ship one operational loop: on `match`, (1) write a dedicated `csam_matches` review queue row (or re-add a `admin_list_content_matches`-style RPC and actually consume it in the admin console with a "pending review" badge), and (2) emit a provider notification (email/webhook/console banner) so the operator files the NCMEC/INHOPE report. Keep the auto-suspend and audit row. The actual filing can stay manual — the gap is that nothing tells a human it's needed. Until the Safer contract is confirmed and reporting wired, either keep uploads fail-closed (status quo) or soften the Terms §7 wording to "we may report".

**Effort:** 1–2 days (queue table + RPC + admin UI badge + notification), plus confirming the Safer contract (`logic.ts:36-41`) before enabling.

---

## P2

### 2. ToS acceptance is conflated with age attestation and never recorded [NEW]

**Evidence:** `src/features/auth/LoginPage.tsx:120-135` — a single checkbox states "I am at least 16 years old and agree to the Terms of Service and Privacy Policy." `AuthContext.tsx:107-117` then calls only `confirmAge()` (which writes `age_verified_at`); there is no `terms_accepted_at`, no accepted-version column, no re-consent flow. `20260917162133_age_verified_at.sql:8` adds only `age_verified_at`.

**Problem:** For a service whose liability posture leans on its ToS (§230 reliance, indemnification, limitation of liability — `TermsPage.tsx:136-153,187-197`), there is no record that any user accepted the terms, or *which version*. When the terms change, no user is re-prompted. One checkbox records one boolean (age) and discards the other two consents. This weakens enforceability and creates a consent-evidence gap symmetric to the age gate the PR otherwise handled well.

**Fix:** Add `terms_accepted_at timestamptz` + `terms_version text` to `profiles` (stamped via the same trigger-guarded `confirm_terms()` pattern, or fold into `confirm_age()` renamed to `confirm_onboarding()`); store the current terms version as a client constant and bump it on each terms edit; when a signed-in user's `terms_version` is behind, gate the app with a re-accept interstitial. Keep it evidence-owned by the DB, not the client.

**Effort:** Small migration + pgTAP + a re-accept banner. ~1 day.

### 3. Age gate is attestation-only; no parental-consent mechanism and no under-16 detection [NEW]

**Evidence:** The gate is a client-side checkbox (`LoginPage.tsx:120-135`) — a user can tick it regardless of age; the server records *only* the self-attestation timestamp (`age_verified_at`, `20260917162133_age_verified_at.sql:1-7` comment: "an assertion the user made, not verified proof of age"). Terms §13 (`TermsPage.tsx:200-207`) promises two things the system cannot do: (a) the Brazil carve-out — "parental consent may be required for users under 18" — has no parental-consent flow anywhere; (b) "if we learn that we have collected personal information from a user below the applicable age of consent, we will take steps to delete it" — but no DOB is collected and no mechanism could ever surface that a user is under 16. Pre-existing accounts carry `age_verified_at = NULL` (`age_verified_at.sql:4-6`) and are never retroactively gated.

**Problem:** Self-attestation age gates are the industry norm for non-financial services (COPPA is US <13; the 16+ floor is a reasonable GDPR-Art-8 harmonization), so this is not a blocker. But the Terms over-promise relative to the implementation: the parental-consent carve-out is dead letter, and the "delete if under 16" commitment has no trigger. The honest fix is either implement a DOB field + parental-consent flag, or narrow the Terms §13 language to what the system actually does ("we rely on self-attestation and have no age-verification or parental-consent mechanism").

**Fix:** Align copy with behavior (preferred, one line) or, if age assurance becomes a real requirement, add a `date_of_birth` (or `is_minor_parental_consent`) field with the same evidence-guard pattern. Decide once; don't ship both.

**Effort:** Copy change ~15 min; full DOB+consent ~1 day.

### 4. No controller identity or contact channel (GDPR Art 13) [NEW]

**Evidence:** `TermsPage.tsx:211` and `PrivacyPage.tsx:159-160` route all contact through "contact the server administrator" / "Contact the server admin" — no named legal entity, no email, no physical or registered address anywhere in either document or in the app.

**Problem:** GDPR Art 13 (and every equivalent) requires the data controller to identify itself and provide a contact point. "Role by Post, its creator" (`TermsPage.tsx:143`) is not an identified controller, and there is no discoverable contact method for data-subject requests beyond being already signed in. For a hobby app this is low-stakes, but it is a concrete, easy-to-fix compliance gap and the most-cited item in any privacy review.

**Fix:** Add a short "Data controller" line to the Privacy Policy footer with the operator's identity and a contact email, and surface that email in the terms footer. Keep the in-app "Download My Data" / "Delete Account" flows as the primary self-serve path.

**Effort:** Copy change. ~15 min.

### 5. Retention periods for hashes and images are undisclosed [NEW]

**Evidence:** `content_hashes` rows are pruned on a fixed 90-day clock regardless of image-retention setting, with `match` rows exempted forever (`supabase/functions/cleanup-images/logic.ts:20-24` — `CONTENT_HASH_RETENTION_DAYS = 90`; `index.ts:111-123` — `.neq("safer_status","match")`); image objects themselves follow `image_retention_days`, default **0 = keep forever** (`cleanup-images/logic.ts:96-98`). Neither the 90-day hash window, the forever-match retention, nor the default-forever image posture appears in `PrivacyPage.tsx`.

**Problem:** The Privacy Policy's "Where data is stored" and "Your rights" sections don't state how long content-hash provenance or images are kept. Since blocked-CSAM hashes are retained *forever by design* (a defensible, arguably required choice), disclosing it is both good practice and protective. Low urgency, trivial to fix.

**Fix:** One paragraph in the Privacy Policy: "Image uploads are retained according to the server's retention setting (kept indefinitely by default); a hash record of each upload is retained 90 days for safety scanning, and records of blocked uploads are kept as long as required for legal reporting."

**Effort:** Copy change. ~15 min.

---

## What's sound — do not touch

- **Age-gate evidence is exemplary.** `age_verified_at` is self-only, idempotent, and unwritable by browser roles: `confirm_age()` (`20260917162133_age_verified_at.sql:50-72`) stamps `COALESCE(age_verified_at, now())` once; the `handle_age_verified_at_change` trigger (`:23-36`) reverts any direct write unless the transaction-local `app.age_confirmation` marker is set (set only inside `confirm_age()` at `:63`); pgTAP covers anon/PUBLIC denial, trigger-helper denial, self-only reach, direct-write refusal, and idempotency (`supabase/tests/20260917162133_age_verified_at.sql:19-65`). The client clears the per-browser flag on sign-out so the next user isn't pre-attested (`AuthContext.tsx:131-135`).
- **Email-consent evidence is DB-owned.** `email_opt_in` (default false) + `email_opt_in_at` stamped by a trigger on every change (`20260909145248_email_opt_in_consent.sql:21-40`) — clients cannot forge or clear the pair. Matches the Privacy Policy's opt-in-only stance (`PrivacyPage.tsx:91-96`).
- **GDPR erasure actually anonymizes.** Profile delete → `messages.sender_id SET NULL` (`20240801000000_init_schema.sql:131`), channels orphaned (`gm_id SET NULL`, `20260813140000_account_deletion_orphan_channels.sql:6-9`). The Privacy Policy's "kept anonymously" claim (`PrivacyPage.tsx:151-153`) is true, not hand-waving. Export completeness was verified fixed in the 20260907 audit.
- **Monitoring disclosure is unusually honest.** Terms §6 (`TermsPage.tsx:93-107`) and Privacy §"How your messages are stored" (`PrivacyPage.tsx:38-46`) flatly state not-E2EE, admin + automated-system access, and the limited purposes — matching the real admin content-inspection RPCs and the scan pipeline. Terms §7's NCMEC/INHOPE naming is correct and appropriately jurisdiction-aware.
- **Admin content oversight is correctly gated and audited.** Every admin content read (`admin_read_message`, `admin_list_user_messages`, `admin_list_channel_messages`) is `is_server_admin()`-guarded, `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC`, and writes an `audit_logs` row before returning (`20260917163229_admin_message_inspection.sql:31-58`, `20260918095420_admin_list_user_messages_cursor.sql:37-44`, `20260918155445_admin_channel_messages.sql:41-52`). The roster read (`admin_list_channel_members`) correctly skips the audit row — it's metadata already exposed by `admin_list_users`, not content (`20260919140454_admin_channel_members.sql:1-8`).
- **Fail-closed scanning posture.** No `SAFER_API_KEY` → no upload (`scan-upload/index.ts:90-96`); unrecognized Safer response → throw → 500 without storing (`logic.ts:42-57`); the client-direct-upload bypass is closed by dropping `images_insert`/`images_update` policies so only the service-role `scan-upload` writes (`20260917171310_restrict_image_writes_to_scan_upload.sql:23-30`). Correct-by-construction.
- **Google Limited Use + accurate scopes.** The Limited Use disclosure is present and linked (`PrivacyPage.tsx:126-139`); OAuth uses Supabase's default `email`/`profile` scopes only (`authApi.ts:17-23`, no explicit scope widening), matching the policy (`PrivacyPage.tsx:78-88`).

---

## Intentional exclusions

- **No DOB / age verification.** Self-attestation age gates are the accepted posture for a non-financial hobby service; a DOB field or third-party age assurance is out of scope unless a platform (App Store / Google OAuth) or jurisdiction makes it mandatory. (P2 #3 is about *copy alignment*, not adding verification.)
- **No automated NCMEC filing.** Filing remains a human act; the P1 fix is to *surface* the duty, not to automate a legal filing to authorities from an edge function.
- **`verify_jwt = false` + shared-secret on `cleanup-images`/`push-notifications`** — carried from the security pillar; the DB trigger/service role is the intended caller. (`scan-upload` uses `verify_jwt = true` + JWT identity, `supabase/config.toml:33-38`.)
- **Soft-delete / pseudonymized message retention.** Deleted accounts' messages persist with `sender_id` nulled to preserve other players' chat history — disclosed in the Privacy Policy and a deliberate GDPR-legitimate-interest posture (carried from prior audits).
- **No ToS "clickwrap" record before this round.** Carried gap now tracked as P2 #2; not retroactively fixable for accounts that predate the fix.

---

## Suggested execution order

1. **P1 #1** — wire the CSAM detection→report path: re-add a `admin_list_content_matches`-style queue (and actually consume it in the admin console with a badge) + operator notification on match. Until Safer is confirmed, keep uploads fail-closed. Highest stakes, only item that touches safety + law together.
2. **P2 #2 + #3** — one PR: record `terms_accepted_at`/`terms_version` via `confirm_terms()`, and align Terms §13 copy with the attestation-only reality (or add DOB/parental-consent). Closes the consent-evidence gap and the over-promise together.
3. **P2 #4 + #5** — one copy-only PR: controller identity/contact line + retention paragraph in the Privacy Policy.

No ordering dependency between 2 and 3. The four P2s are all cheap; batch as one "legal copy + consent evidence" PR if preferred.
