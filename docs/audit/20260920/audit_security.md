# Security & Data Integrity Audit — 2026-09-20

## Audit Prompt

> You are an Application Security Engineer writing ONE audit report. This is a READ-ONLY audit: do not modify any code, do not run `gh`, do not run tests/builds/DB. You may run `npx tsc -p tsconfig.app.json --noEmit` and `npx oxlint` and read files.
>
> Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260920 (a git worktree — treat it as the repo root).
>
> Your ONLY output file: docs/audit/20260920/audit_security.md (directory exists).
>
> Context: React 19 + Vite + TypeScript + Supabase (Postgres/RLS/Realtime/Edge Functions) + PWA multiplayer play-by-post TTRPG. A full audit last ran 2026-09-07; ~30 PRs merged since. Job: (1) re-verify the 20260907 security findings are actually fixed in code, (2) audit the NEW security-relevant surface, (3) write the report.
>
> Baselines: docs/audit/20260907/audit_security.md (5 P2 findings), docs/audit/20260907/INDEX.md (deduped totals + intentional exclusions), docs/audit/20260904/audit_security.md.
>
> Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID), or [INTENTIONAL] (deliberate choice, list under Intentional Exclusions). Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX. Every finding must cite `file:line` evidence verified against real code. No evidence = no finding.

---

**Date:** 2026-09-20
**Scope:** Security & data integrity pillar — re-verification of sec-20260907 findings #1–#5; new surface: age gate (`age_verified_at`/`confirm_age`), content scanning (`scan-upload` + `content_hashes` + storage write-restriction), admin content inspection RPCs, email opt-in consent, abuse-report integrity, `push-notifications` refactor, and every migration merged since 2026-09-07 (grant-sweep durability, unread-count evolution, lobby-preview changes).
**Verification commands run:**

- `npx tsc -p tsconfig.app.json --noEmit` → **passed** (no errors)
- `npx oxlint` → **passed (exit 0)** — 46 warnings (all react-compiler rules), 0 errors
- Tests/coverage/build were run by the orchestrator (not in this report's contract): 1770 passed / 0 failed, coverage 92.82 / 84.83 / 90.4 / 95.65 (statements / branches / functions / lines).

---

## Executive Summary

**All five sec-20260907 findings are [FIXED] in code.** The age gate, content-scanning pipeline, and admin-inspection RPCs are well-built: the CSAM scan's client-direct-upload bypass is genuinely closed (only the service-role `scan-upload` writes the `images` bucket, and the DB write-guard still fires on service-role writes), the age attestation is self-only + idempotent + client-immutable with pgTAP, and every new admin read is `is_server_admin()`-gated, `search_path`-pinned, and audited.

**No P0. No P1.** Three small P2s, all hardening rather than defects: the grant-sweep's `authenticated` side is still non-durable (a new SECURITY DEFINER trigger function shipped without a revoke, re-opening the exact class 20260907#5 closed), `scan-upload`'s rolling quota cap is defeatable by object-path reuse and has no size bound *before* the scan (a paid-provider cost-burn vector), and the batch unread function `get_unread_totals` retains `authenticated` EXECUTE with no self-guard — the batch sibling of the cross-user metadata read fixed in #1.

The trust boundary is in strong shape. Ship the three P2s as one chore PR.

---

## Prior findings disposition

| # | Finding | Status | Evidence (current state) |
|---|---|---|---|
| 1 | `get_user_channels_unread` accepts arbitrary `p_user_id` | **[FIXED]** | Self-guard: `supabase/migrations/20260907110653_unread_counts_exclude_invisible_whispers.sql:22-30` (`v_uid := auth.uid()`, `p_user_id IS DISTINCT FROM v_uid` → RAISE); carried forward unchanged in `20260907140000_issue_441_unread_exclude_blocked_members.sql:28-37` and `20260915122559_issue_517_badge_unread_total.sql:34-43`. |
| 2 | NPC avatar URLs bypass URL-scheme contract | **[FIXED]** | `supabase/migrations/20260907094614_sec3_npc_avatar_url_scheme.sql:18-48` — SECURITY DEFINER `enforce_npc_url_scheme` trigger on `channel_npcs` + `messages`, pinned `search_path`; pre-existing values scrubbed `:61-70`; explicit revoke `:52-53`. |
| 3 | `mark_admin_thread_read` writes read-state for arbitrary thread ids | **[FIXED]** | `supabase/migrations/20260909145247_admin_messages_all_users.sql:149-185` — visibility gate mirrors the SELECT policy; `RAISE EXCEPTION 'Thread not found.'` for non-readable threads. |
| 4 | SW notification click opens unvalidated URL | **[FIXED]** | `src/sw.ts:115-138` — re-checks `isSiteRelativeUrl(url)` before `openWindow`; `src/lib/swPush.ts:13-16` (`isSiteRelativeUrl`) + `:24-27` (schema `refine`). |
| 5 | Grant sweep left EXECUTE on trigger/definer helpers for `authenticated` | **[FIXED]** (with a durability caveat — see P2 #1) | `supabase/migrations/20260907093802_sec1_extend_grant_sweep.sql:19-76` revokes the trigger/hook list; `20260907101325_sec6_url_scheme_trigger_definer.sql:55-58` revokes the URL-scheme pair. pgTAP `supabase/tests/20260905141623_sec1_grant_sweep.sql:68-259`. |

---

## P0

None.

---

## P1

None.

---

## P2

### 1. Grant-sweep durability: post-sweep SECURITY DEFINER trigger shipped without a revoke [NEW]

**Evidence:**

- `supabase/migrations/20260909162733_abuse_reports_integrity_trigger.sql:10-51` — `enforce_abuse_report_integrity()` is `SECURITY DEFINER` and ends with **no** `REVOKE`; `:61-77` — `enforce_abuse_report_immutable_report_target()` also has no revoke.
- `supabase/migrations/20260909145248_email_opt_in_consent.sql:21-34` — `handle_email_opt_in_change()` has no revoke.
- `supabase/migrations/20260907200109_sec1_pin_default_function_privs.sql:33-37` — the durable pin strips only `anon`/`PUBLIC` from default privileges; **`authenticated` and `service_role` remain the default** for new functions.
- The house convention these three violate is right there in the same era: `supabase/migrations/20260917162133_age_verified_at.sql:46-47` explicitly revokes its trigger helper from all four roles.

**Problem:** The 20260907 #5 fix was an explicit list, and `20260907200109` only made the *anon* side durable. `authenticated` EXECUTE on server-only trigger functions still relies on per-migration revokes — and three trigger functions merged 2026-09-09 skipped them. `enforce_abuse_report_integrity` is the dangerous one: SECURITY DEFINER. It is not callable today (it dereferences `NEW`/`OLD`, so a direct call raises "record NEW is not assigned yet"), but this is exactly the "future helper that doesn't dereference NEW becomes authenticated-callable with definer privileges" class 20260907#5 was written to close permanently. The pgTAP sweep (`supabase/tests/20260905141623_sec1_grant_sweep.sql`) asserts an explicit list and does not cover these three, so the regression is silent.

**Fix:** One migration revoking `enforce_abuse_report_integrity()`, `enforce_abuse_report_immutable_report_target()`, and `handle_email_opt_in_change()` from `PUBLIC, anon, authenticated, service_role`; then extend the sweep pgTAP to assert *every* `RETURNS trigger` function in `public` (or every non-client RPC) has `authenticated` EXECUTE = false, so the class stays closed without manual list upkeep.

**Effort:** One migration + test sweep. Half a day.

### 2. `scan-upload` quota cap defeatable by object-path reuse; no size bound before the scan [NEW]

**Evidence:**

- `supabase/functions/scan-upload/index.ts:147-158` — the rolling cap counts `content_hashes` rows by `uploaded_by` in the last hour (`MAX_UPLOADS_PER_HOUR = 100`, `logic.ts:65`).
- `supabase/functions/scan-upload/index.ts:164-173` — the `content_hashes` insert (with `object_path` UNIQUE, `20260917163230_content_hashes.sql:11`) is attempted *before* the scan and its failure is non-fatal (`console.error`, no throw); the code proceeds to `submitToSafer` at `:175`.
- `supabase/functions/scan-upload/index.ts:139-142` — the only byte check is `byteLength === 0`; there is no size cap before the scan. The `image_max_size_mb` cap lives in the DB trigger and fires only at *store* time (`20260914160000_clamp_image_dimension_metadata.sql:37-40`), after Safer has already been billed.

**Problem:** A GM (who passes the `gm_id === user.id` check at `:130-137`) can bypass the quota by reusing the same valid path: the second insert hits the `object_path` UNIQUE constraint, so the count never increments, yet the bytes are still hashed and submitted to Thorn Safer each time — then the store fails on `upsert: false` (`:214`). They can also send an oversized file directly (no client resize), which reaches Safer before the DB size cap rejects the store. Net effect: the operator's paid provider quota is burnable without bound by a single channel GM, defeating the very purpose of `MAX_UPLOADS_PER_HOUR`. No data-integrity impact — the object is never stored unscanned, and the store path stays fail-closed.

**Fix:** Two cheap guards in `scan-upload/index.ts`: (a) reject with `409`/`throttled` when a `content_hashes` row already exists for `(object_path)` — or count *attempts* independently of the UNIQUE insert so reuse still increments the cap; (b) enforce `image_max_size_mb` (and `image_uploading_enabled`) in the function *before* `submitToSafer`, mirroring what the DB trigger does at store time, so disabled/oversized uploads never touch the provider. Add vitest cases for reuse and oversized inputs.

**Effort:** ~30 lines + two tests. Half a day.

### 3. `get_unread_totals` retains `authenticated` EXECUTE and takes arbitrary user ids [NEW]

**Evidence:**

- `supabase/migrations/20260915122559_issue_517_badge_unread_total.sql:73-101` — `get_unread_totals(p_user_ids UUID[])` is `LANGUAGE sql` (invoker-rights) and ends with `REVOKE ALL FROM PUBLIC` + `GRANT TO service_role` only; no `REVOKE FROM authenticated`. The 20260905141623 sweep's blanket `GRANT … TO authenticated` (never stripped) persists.
- Contrast, same file: `get_admin_unread_totals` at `:170-171` explicitly revokes `authenticated`/`anon`; and the per-user sibling `get_user_channels_unread` carries the self-guard at `:38-43` (the #1 fix).

**Problem:** An authenticated caller can invoke `get_unread_totals([any_user_id])` through PostgREST and read another user's unread counts. RLS bounds it to channels the caller also belongs to (the `channel_members`/`messages` policies), so it is the same cross-user *activity metadata* leak that 20260907#1 fixed for the per-user function — how many messages a co-member has unread in each shared channel — left open on the batch variant. No content exposure, no data loss. The function's only legitimate caller is the push edge function (service role), so `authenticated` should never have had it.

**Fix:** Add `REVOKE EXECUTE ON FUNCTION public.get_unread_totals(UUID[]) FROM authenticated;` (one line), matching `get_admin_unread_totals`. Optionally assert it in the sweep pgTAP.

**Effort:** One line + a test assertion. Under an hour.

---

## What's sound — do not touch

- **sec-20260907 remediation quality:** all five findings fixed with evidence (table above); the fix wave included pgTAP for the self-guard, NPC-scheme, and grant-sweep classes.
- **Age gate** (`20260917162133_age_verified_at.sql`): `confirm_age()` is SECURITY DEFINER + pinned `search_path`, self-only (`WHERE id = auth.uid()`), idempotent (`COALESCE(age_verified_at, now())`); the guard trigger reverts any direct client write of `age_verified_at` unless the transaction-local marker `app.age_confirmation` is set by `confirm_age()` (`:29-35`, `:63`); trigger helper revoked from all roles (`:46-47`). pgTAP covers immutability, self-only, idempotency, and grant state (`supabase/tests/20260917162133_age_verified_at.sql`). `set_config` is not reachable via PostgREST (`pg_catalog` is not in `extra_search_path`, `config.toml:10`). The client clears the per-browser flag on sign-out so a shared device can't pre-stamp someone else (`src/features/auth/AuthContext.tsx:132-139`). The gate is self-attestation by design, not access control — no RPC checks it (documented at `age_verified_at.sql:1-11`).
- **CSAM scan bypass actually closed** (`20260917171310_restrict_image_writes_to_scan_upload.sql`): `images_insert`/`images_update` dropped; the only writer is the service-role `scan-upload` (verified — `src/` has zero direct `.upload()` calls; only `scan-upload`, `useSignedImageUrl.info()`/signed URLs, and `useChannelMedia` listing remain). Fail-closed: no `SAFER_API_KEY` → refuse (`index.ts:93-96`); unrecognized Safer response throws → 500 without storing (`logic.ts:42-57`); scan happens before store; auto-suspend + `audit_logs` (`csam_match_blocked`) on match (`index.ts:177-206`). GM-only via `gm_id === user.id` (`:130-137`); path traversal blocked by the `{uuid}/{folder}/{uuid}.jpg` shape and `match[1] === channelId` (`logic.ts:22-28`); width/height metadata clamped (`20260914160000`).
- **Admin content-inspection RPCs:** every `admin_read_message`, `admin_list_user_messages`, `admin_list_channel_messages`, `admin_list_channel_members`, `admin_list_abuse_reports`, `admin_resolve_abuse_report`, `admin_list_users`, `admin_get_user_history` is `is_server_admin()`-gated, `SET search_path = public`, `REVOKE ALL FROM PUBLIC`, and content reads write `audit_logs`. Cursor correctness fixed with a `(created_at, id)` keyset (`20260918095420:57-66`, `20260918155445:71-79`). Deleted RPCs removed cleanly (`20260918092818`). `admin_read_message` returns empty on missing message (no error-oracle) (`20260917171311`).
- **Abuse-report integrity:** `enforce_abuse_report_integrity` derives `channel_id`/`reported_user_id` from the message row, requires reporter membership, and rejects NPC targets (`20260909162733:10-51`); linkage immutability trigger guards UPDATE (`:61-77`). `admin_resolve_abuse_report` only accepts `resolved`/`dismissed` and audits (`20260910120000:81-100`).
- **Email opt-in consent:** the flag's timestamp is DB-owned via trigger (`20260909145248:21-34`); client sends only the boolean (`src/features/auth/authApi.ts:48-53`).
- **push-notifications:** shared secret hashed-then-compared constant-time (`index.ts:43-55`); secret read via service-role table read, never exposed (`index.ts:297-306`); whisper bodies content-free and routed only to the target (`filter.ts:151-172`); mentions parsed server-side from persisted chips and intersected with membership (`filter.ts:233-258`, `index.ts:121-127`); the #533 change strips markdown to plain text so lock-screen bodies show names, not chip syntax, and empty-label link/image URLs never reach the tray (`filter.ts:69-100`); suspended/blocked/archived excluded from unread totals (`20260915122559`, `20260907140000`).
- **Lobby-preview whisper safety preserved:** the sender-prefix rewrite (`20260910130000`, `20260910150000`) keeps `if new.whisper_to is null` and the backfill correlates only on non-whisper producers — no re-exposure of the #406 scrub.
- **Service-role DML grant** (`20260907115918`): mirrors hosted Supabase defaults; RLS remains the authority (carried exclusion).

---

## Intentional exclusions

Carried from `docs/audit/20260907/INDEX.md` and re-verified deliberate — do not "fix":

- **`verify_jwt = false` on `push-notifications`/`cleanup-images` with shared-secret auth** (`supabase/config.toml:13-31`) — DB trigger is the sole caller; secret unreadable by API roles. (`scan-upload` uses `verify_jwt = true` + JWT identity, `config.toml:33-38`.)
- **Whisper privacy model** — sender + target + GM by RLS; content-free push bodies; received whispers excluded from GDPR export.
- **Client-side PBKDF2 with DB-side compare** (`get_channel_salt` authenticated) — plaintext never reaches the DB.
- **Mimetype is label-only on uploads** — coarse `image/*` gate; documented ceiling + client JPEG re-encode.
- **CSP `script-src 'unsafe-inline'`** — nonce-ification remains the deferred optional follow-up.
- **X-Card anonymity-by-design** and GM-only resolution.
- **GM NPC posting + client-hashed channel passwords** — core product design, authorized server-side.
- **Open signup; distributed brute-force residual** — per-IP limiting unreachable from Postgres.
- **Soft-delete-only messages; stale-but-safe previews after edits.**
- **Image retention defaults to 0 (no-op cleanup).**
- **Explicit table DML grants** (`20260905195245`, `20260907115918`) — matches hosted Supabase behavior under CLI v2.111.0; RLS remains the authority.
- **Age gate is self-attestation, not access control** — no RPC enforces `age_verified_at`; the client checkbox gates sign-in, the DB records evidence. Stated intent at `20260917162133_age_verified_at.sql:1-11`.
- **Admin content reads include whispers + soft-deleted rows and are audited** — explicit moderation/safety-review intent (`20260918155445_admin_channel_messages.sql:5-7`); `admin_list_channel_members` omits an audit row because roster metadata is already bulk-exposed by `admin_list_users` (`20260919140454_admin_channel_members.sql:6-9`).

---

## Suggested execution order

1. **P2 #3** — revoke `authenticated` on `get_unread_totals` (one line + test). Closes the last cross-user unread metadata read.
2. **P2 #1** — revoke the three post-sweep trigger functions + extend the sweep pgTAP to assert the whole trigger-function class. Permanently closes the class 20260907#5 started.
3. **P2 #2** — scan-upload pre-scan guards: reject reused paths (or count attempts independent of the UNIQUE insert) + enforce size/enablement before `submitToSafer`. Protects the paid provider budget.
4. Batch 1–3 in one chore PR; no ordering dependency between them.
