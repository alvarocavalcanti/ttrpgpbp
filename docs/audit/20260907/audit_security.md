# Security & Data Integrity Audit — 2026-09-07

## Audit Prompt

> You are an Application Security Engineer auditing a multiplayer Play-by-Post TTRPG web app (React + Supabase). This is a RESEARCH + REPORT task: you must NOT modify any code. Your ONLY file output is one audit report file (path below).
>
> Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260907 (a git worktree — treat it as the repo root; set your workdir there).
>
> AUDIT CONTRACT (applies to every finding):
>
> - Read-only audit. Do NOT modify any file except your single report file: docs/audit/20260907/audit_security.md (directory exists). Do NOT run `gh` or ANY git command. Do NOT run tests, builds, or database commands.
> - Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files (grep/read tools).
> - Every finding must cite evidence as `file:line` (relative to repo root). No evidence = no finding. Verify every claim against actual code/migrations, not docs or changelogs.
> - Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
> - Baselines — read these first, do NOT re-report remediated items:
>   - docs/audit/20260904/audit_security.md (your DIRECT predecessor — FIRST verify each of its findings #1–#9 against current code: mark [FIXED] or [OPEN] with file:line evidence of CURRENT state before adding anything new)
>   - docs/audit/20260904/INDEX.md (deduped totals + intentional exclusions — carry exclusions over)
>   - docs/audit/20260831/phase4_audit.md and docs/audit/20260831/ux_audit.md, docs/audit/20260828/phase3_audit.md (older baselines; treat [VERIFIED STABLE] as closed unless regression)
> - Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID e.g. `sec-20260904#1`, `phase4#P1`), or [INTENTIONAL] (deliberate product choice — list separately under Intentional Exclusions, do not propose fixes).
> - Stack: React 19, Vite, TypeScript, hand-rolled Tailwind (no Shadcn), Supabase (Postgres/RLS/Realtime/Edge Functions), PWA, Node 26.
>
> YOUR PILLAR — Security & data integrity. Audit the trust boundary end to end:
>
> 0. FIRST — prior-finding verification. The 20260904 security findings (all were subsequently fixed by commits; verify in code, not changelogs):
>    #1 [P1] whisper leak via channels.last_message_preview trigger (fix migration should CASE-null preview on whisper_to + recompute backfill + pgTAP)
>    #2 [P1] push_notification_config_value leaked PUSH_INTERNAL_SECRET (fix: REVOKE FROM anon/authenticated/service_role + pgTAP)
>    #3 [P2] grant sweep: every REVOKE…FROM PUBLIC left anon/authenticated EXECUTE (fix: sweep migration + has_function_privilege pgTAP sweep)
>    #4 [P2] member-authored character_sheet_url/character_avatar_url skip scheme validation (fix: extend enforce_url_scheme to channel_members + client guard)
>    #5 [P2] Sentry session replays capture chat DOM text (fix: maskAllText)
>    #6 [P2] GDPR export omits own abuse_reports + authored admin_messages (fix: read-back policy + export sections)
>    #7 [P2] set_channel_last_message_at definer without pinned search_path
>    #8 [P2] announcement pushes target suspended GMs
>    #9 [P2] CSP lacked base-uri/form-action/object-src
>    For each: [FIXED] with evidence, [OPEN], or [PARTIAL] with what remains.
> 1. RLS policies and their helper functions (`is_channel_member`, `is_suspended`, `is_channel_gm`, `is_server_admin`) in supabase/migrations/ — including the NEW whisper-preview fix migration: does the fix hold for every write path (UPDATE of a message to/from whisper status? DELETE? does last_message_preview get recomputed correctly when a whisper is edited into a public message or vice versa)?
> 2. SECURITY DEFINER RPCs: `send_message`, `roll_dice`, `join_channel`, `update_channel_settings`, `set_active_players`, `get_admin_unread_count`, mention/push trigger functions. Check: inline membership checks missing `is_suspended`/`is_blocked`, orphan-channel edge cases (NULL gm_id), privilege escalation via direct-table writes vs RPC path divergence, replay/idempotency abuse.
> 3. PUBLIC-executable SECURITY DEFINER helpers missing `REVOKE ... FROM PUBLIC, anon, authenticated` — the grant sweep landed 2026-09-05ish; spot-check it actually covers functions created BEFORE and AFTER the sweep (any function created after the sweep migration without explicit revokes reopens the class — check migrations ordering).
> 4. Brute-force/abuse oracles: `join_channel` password throttling, suspension bypass, rate limits.
> 5. The `push-notifications` edge function: JWT/secret verification, CORS, payload trust, content leaks (whisper privacy), mention routing, subscription cleanup. Also `cleanup-images`.
> 6. Storage: `images` bucket policies, path traversal in storage keys.
> 7. Client-side secrets: src/lib/, src/env.ts (Zod), service worker (src/sw.ts, src/lib/swPush.ts), Sentry/GA scrubbing.
> 8. HTTP headers/security config: supabase/config.toml, public/_headers (verify the new CSP directives; check for gaps remaining).
> 9. Privacy: GDPR export completeness, retention, privacy policy vs telemetry.
>
> REPORT STRUCTURE (markdown, this exact skeleton) in docs/audit/20260907/audit_security.md:
>
> 1. `## Audit Prompt` — reproduce this prompt verbatim (from "You are an Application Security Engineer" through this bullet).
> 2. Header block: date 2026-09-07, scope, verification commands run + results.
> 3. `## Executive Summary` — short, blunt verdict.
> 4. `## Prior findings disposition` — the #1–#9 table with [FIXED]/[OPEN]/[PARTIAL] + evidence.
> 5. `## P0` / `## P1` / `## P2` sections. Each finding: bold title, tag, evidence file:line, problem, concrete fix, rough effort. Order by return-on-effort within severity.
> 6. `## What's sound — do not touch`.
> 7. `## Intentional exclusions`.
> 8. `## Suggested execution order`.

---

**Date:** 2026-09-07
**Scope:** Security & data integrity pillar — prior-findings verification (sec-20260904 #1–#9), RLS helpers + the whisper-preview fix across all write paths, SECURITY DEFINER RPCs, grant-sweep coverage for pre/post-sweep functions, abuse oracles, `push-notifications` / `cleanup-images` edge functions, `images` storage policies, client secrets/SW, HTTP headers/config, privacy (GDPR export, retention, telemetry).
**Verification commands run:**

- `npx tsc -p tsconfig.app.json --noEmit` → **passed** (no errors)
- `npx oxlint` → **passed** (exit 0, clean)
- No tests, builds, DB commands, git or `gh` commands run (per contract). All claims verified by reading migrations, edge functions, tests, and client source.

---

## Executive Summary

**The remediation wave is fully landed and verified: all nine sec-20260904 findings are [FIXED] in code, with pgTAP suites.** The whisper-preview fix is airtight — the preview is written by exactly one INSERT-only trigger, message routing fields (including `whisper_to`) are immutable on UPDATE, so no edit/delete path can re-expose whisper content — and the grant sweep holds for functions created after it (the only post-sweep function-bearing migration carries explicit revokes; the rest add indexes/constraints/policies only).

**No P0. No P1.** Five small P2s remain, all narrow hardening rather than defects: an RLS-bounded cross-user unread-metadata read (`get_user_channels_unread` takes any `p_user_id`), NPC avatar URLs bypassing the URL-scheme contract every other avatar field follows, an unvalidated thread id in `mark_admin_thread_read`, an unscoped push-click URL in the service worker, and trigger-helper EXECUTE grants the sweep's blanket `GRANT … TO authenticated` left behind (harmless today — direct calls error on undefined `NEW` — but they are the one class the sweep meant to close).

The trust boundary is in good shape. Ship the P2 batch as one chore PR.

---

## Prior findings disposition

| # | Finding | Status | Evidence (current state) |
|---|---|---|---|
| 1 | Whisper leak via `channels.last_message_preview` (P1) | **[FIXED]** | Trigger CASE-nulls preview on whispers: `supabase/migrations/20260905123437_whisper_preview_scrub.sql:36-45`; historical scrub `:21-29`; recreated with pin in `20260905153829_sec5_search_path_pin.sql:7-12`; pgTAP `supabase/tests/20260905123437_issue_406_whisper_preview_leak.sql`. Write-path audit (see below): fix holds for UPDATE/DELETE. |
| 2 | `push_notification_config_value` leaked `PUSH_INTERNAL_SECRET` (P1) | **[FIXED]** | `supabase/migrations/20260905135533_push_secret_revoke.sql:9-10` (revoke from PUBLIC, anon, authenticated, service_role); restated in sweep `20260905141623_sec1_grant_sweep.sql:33-34`; pgTAP `supabase/tests/20260905135533_issue_407_push_secret_revoke.sql` + `supabase/tests/20260905141623_sec1_grant_sweep.sql:33-37`. |
| 3 | Grant sweep for `REVOKE…FROM PUBLIC` class (P2) | **[FIXED]** | `20260905141623_sec1_grant_sweep.sql:18` (schema-wide `REVOKE … FROM PUBLIC, anon`), `:26` (deterministic re-grant to authenticated/service_role), `:33-53` (server-only helpers fully revoked). pgTAP asserts **zero** anon-executable user functions: `supabase/tests/20260905141623_sec1_grant_sweep.sql:12-21`. Post-sweep functions carry explicit revokes (`20260905144748_sec2_member_url_scheme.sql:78-81`); later migrations add no functions (index `20260905175441`, policies `20260906095225`, constraint `20260906101600`). |
| 4 | Member-authored `character_sheet_url`/`character_avatar_url` skip scheme validation (P2) | **[FIXED]** | DB trigger on INSERT/UPDATE of channel_members: `20260905144748_sec2_member_url_scheme.sql:55-73`; shared WHATWG-normalized check `:16-33`; pre-existing values scrubbed `:86-95`; client guard `src/features/channels/MemberList.tsx:194` (`/^https?:\/\//i` before rendering href) and input validation `src/features/channels/EditCharacterModal.tsx:61`; pgTAP `supabase/tests/20260905144748_sec2_member_url_scheme.sql`. |
| 5 | Sentry session replays capture chat DOM text (P2) | **[FIXED]** | `src/lib/sentry.ts:41-43` — `replayIntegration({ maskAllText: true })`. |
| 6 | GDPR export omits own `abuse_reports` + authored `admin_messages` (P2) | **[FIXED]** | Read-back policy `20260905151828_sec4_gdpr_export_readback.sql:5-7`; export sections `src/features/auth/exportUserData.ts:106-115` (queries) and `:150-157` (output); pgTAP `supabase/tests/20260905151828_sec4_gdpr_export_readback.sql`. |
| 7 | `set_channel_last_message_at` definer without pinned `search_path` (P2) | **[FIXED]** | `20260905153829_sec5_search_path_pin.sql:7-12` (`SET search_path = public`); pgTAP `supabase/tests/20260905153829_sec5_search_path_pin.sql`. |
| 8 | Announcement pushes target suspended GMs (P2) | **[FIXED]** | `supabase/functions/push-notifications/index.ts:215-230` (fetches `profiles.is_suspended`, routes through filter); `supabase/functions/push-notifications/filter.ts:222-232` (`resolveAnnouncementGmTargets` drops suspended); tests `supabase/functions/push-notifications/filter.test.ts:550-578`. |
| 9 | CSP lacked `base-uri`/`form-action`/`object-src` (P2) | **[FIXED]** | `public/_headers:2` — `base-uri 'self'; form-action 'self'; object-src 'none'` all present. The `script-src 'unsafe-inline'` nonce-ification remains the documented optional follow-up (carried under Intentional exclusions). |

### Whisper-preview fix — write-path audit (prompt item 1)

- **Only writer is the INSERT trigger.** `grep last_message_preview` across `supabase/migrations/` returns exactly three definition sites: the column+backfill (`20260904111055_channel_last_message_preview.sql:3-13`), the fixed trigger (`20260905123437_whisper_preview_scrub.sql:36-45`), and the pinned recreation (`20260905153829_sec5_search_path_pin.sql:7-22`). No UPDATE/DELETE trigger touches the column.
- **UPDATE path cannot flip whisper status:** `whisper_to` is immutable on client writes — `20260812120000_secure_passwords_and_field_immutability.sql:76-93` (`messages_routing_immutable` raises on `whisper_to`/`type`/`sender`/`channel` change; channel/sender additionally guarded by `prevent_message_routing_change` and `20260818140000_enforce_mutation_integrity.sql:112-127`). So a whisper can never be *edited into* a public message or vice versa: no preview recomputation is needed, and none exists to be bypassed. Edited public messages leave a stale-but-previously-public preview (safe direction); the message-content cap re-validates on every UPDATE (`20260906101600_messages_content_length_cap.sql:6-14`).
- **DELETE path:** messages are soft-delete-only (`is_deleted` UPDATE policy, `20260808121758_fix_message_edit_delete.sql:30-38`) — rows and previews persist by design (carried exclusion); no preview rewrite occurs.
- **Backfill scrub is correct-by-construction:** the scrub correlates on `created_at = last_message_at` and nulls previews whose producing row was a whisper (`20260905123437_whisper_preview_scrub.sql:13-29`), with ties resolving to NULL (safe direction).

---

## P0

None.

---

## P1

None.

---

## P2

### 1. `get_user_channels_unread` accepts an arbitrary `p_user_id` — cross-user unread metadata [NEW]

**Evidence:** `supabase/migrations/20260812160000_user_channels_unread.sql:4-18` — INVOKER-rights SQL function filtering only on `cm.user_id = p_user_id`, granted to authenticated (`:20-21`); nothing pins `p_user_id = auth.uid()`. The client calls it for self only, but the RPC contract doesn't enforce it.

**Problem:** Any authenticated user can call it with another member's id. RLS bounds the damage — the count subquery reads `messages` under the caller's RLS and the `channel_members` row must itself be visible — so the leak is *activity metadata between people who already share a channel*: how many messages the peer hasn't read per shared channel, which approximates when they last opened it. No content exposure, no data loss; a contract gap that contradicts the function's own comment ("the caller is only ever counting their own memberships' messages").

**Fix:** One migration: guard the function with `p_user_id = auth.uid()` (either raise, or hardcode `cm.user_id = auth.uid()` and drop the parameter semantics for non-admins). Matches the `get_admin_unread_count` self-or-admin precedent (`20260831140000_issue_335_authz_hardening.sql:677-695`). Add a pgTAP case (caller ≠ p_user_id → empty/exception).

**Effort:** One-line migration + small pgTAP. Under an hour.

### 2. NPC avatar URLs bypass the URL-scheme contract (`messages.npc_avatar_url`, `channel_npcs.avatar_url`) [NEW]

**Evidence:** `send_message` persists the client-supplied portrait without validation when the NPC is new — `20260831140000_issue_335_authz_hardening.sql:334-338` (`v_npc_avatar_url := p_npc_avatar_url; INSERT INTO channel_npcs …`); the sec2 scheme trigger covers only `channel_members` (`20260905144748_sec2_member_url_scheme.sql:70-73`) and the channels trigger only `channels` columns (`:37-52`); `messages_npc_name_length` is the only NPC-related CHECK — no constraint on either avatar column (`20260818140000_enforce_mutation_integrity.sql:80-85`).

**Problem:** GM-only surface (npc type is GM-gated, `issue_335:294-296`), and the value renders in an `<img src>`, where `javascript:`/`data:` are inert in modern browsers — so this is contract inconsistency and defense-in-depth, not an XSS. It is the same inconsistency sec-20260904#4 fixed for member URLs: identical fields should play by the same rules on every table. Unbounded length is a minor bonus gap.

**Fix:** Extend the shared `url_scheme_allowed` check to `channel_npcs.avatar_url` and `messages.npc_avatar_url` (BEFORE INSERT/UPDATE trigger on `channel_npcs`, plus a CHECK or the existing triggers' pattern for `messages`; cap length like the sibling fields). Relative storage paths must keep passing per the refined contract.

**Effort:** Small migration + pgTAP. Half a day.

### 3. `mark_admin_thread_read` writes read-state for arbitrary thread ids [NEW]

**Evidence:** `supabase/migrations/20260821160948_20260821000000_admin_gm_comms.sql:147-159` — upserts `admin_thread_reads(thread_id, auth.uid())` with no check that the caller participates in the thread (GM of a DM, admin, or announcement-eligible GM) and no RLS backstop is involved (SECURITY DEFINER, table policies only gate direct access).

**Problem:** Any authenticated user can blind-write read rows for thread ids they cannot see (ids are exposed in URL fragments/payloads for their own threads; foreign ids are guessable only with leakage). No information flows *to* the caller and the unread-count query filters by visibility (`issue_335:677-695`), so impact is integrity noise — forged participation records and skewed read-state if thread ids ever leak. Contract should mirror `get_admin_unread_count`.

**Fix:** Add a participation check in the function: announcement threads require `is_active_gm(auth.uid())`, DM threads require `auth.uid() = t.gm_id OR is_server_admin()`; raise otherwise. One small migration + pgTAP.

**Effort:** Small. Half a day.

### 4. Service-worker notification click opens an unvalidated URL [NEW]

**Evidence:** `src/sw.ts:92-109` — `notificationclick` calls `self.clients.openWindow(url)` with `event.notification.data?.url`; the only validation upstream is `PushNotificationDataSchema` (`src/lib/swPush.ts:7-16`), where `url: z.string().optional()` accepts any string, any scheme, any origin. (Focus-existing-tab is properly same-path checked via `matchesPath`, `src/sw.ts:29-36`.)

**Problem:** The payload signer is our edge function (constants only: `/channel/:id`, `/messages` — `supabase/functions/push-notifications/filter.ts:53,84,100,157`), and payloads are Web-Push-encrypted to the subscription, so exploiting this requires the VAPID private key or a compromised push service. Pure hardening: one `refine` makes the SW refuse to navigate off-origin even if a future payload source misbehaves.

**Fix:** In `PushNotificationDataSchema`, `.refine(u => /^\/[^/]/.test(u))` (site-relative path only), or check `new URL(url, self.location.origin).origin === self.location.origin` in the click handler before `openWindow`. Update the SW push test.

**Effort:** One line + test. Under an hour.

### 5. Grant sweep left EXECUTE on trigger/definer helper functions for `authenticated` [NEW]

**Evidence:** The sweep blanket-grants `authenticated, service_role` on *every* function in `public` (`20260905141623_sec1_grant_sweep.sql:26`) and then revokes only six server-only helpers (`:33-53`). SECURITY DEFINER trigger functions remain authenticated-executable, e.g. `set_channel_last_message_at` (`20260905123437_whisper_preview_scrub.sql:31-45`), `handle_new_message_notification` (`20260821160948:196-224`), `enforce_image_upload_rules` (`20260826160000:33-78`), `handle_new_user` (`20240801000000_init_schema.sql:24`). The sweep's own pgTAP only asserts the anon side and the six helpers (`supabase/tests/20260905141623_sec1_grant_sweep.sql:12-57`).

**Problem:** Not exploitable today — every one of these references `NEW`/`OLD`/`TG_*`, so a direct PostgREST call errors before doing anything — but they are precisely the "server-only helpers lose EXECUTE for every API role" class the sweep was written to close, and a future helper that *doesn't* dereference `NEW` (or a signature change making `NEW` optional) would silently become callable by any authenticated user with definer privileges.

**Fix:** Extend the sweep's revoke list to all trigger-executable functions in `public` (mechanical: `pg_proc.protrftypid`-based or an explicit list), asserting via `has_function_privilege` in the existing sweep test.

**Effort:** One migration + test additions. Half a day.

---

## What's sound — do not touch

- **sec-20260904 remediation quality:** all nine fixes verified in code with pgTAP suites (table above); the grant sweep is the deterministic baseline the project needed (`20260905141623_sec1_grant_sweep.sql:18-26` + zero-anon assertion `tests:12-21`).
- **Suspension model:** every command RPC refuses suspended callers up front (`issue_335:70,257,400,455,562`) and refuses suspended whisper/active-player targets (`:319,355,413`); `is_channel_member`/`is_channel_gm`/`is_active_gm` all exclude suspended users (`20260819130000_abuse_controls.sql:19-41`, `issue_335:665-674`); self-suspension changes blocked by trigger (`20260826120000_fix_rls_authorization_bypasses.sql:13`).
- **Join oracle:** windowed 5-failures/10-min per user+channel throttle with self-cleaning rows and success-clears-history (`issue_335:511-613`); `channel_join_failures` has RLS with no policies + full grants revoked (`:522-523`). Distributed across-accounts brute-force remains the accepted residual (carried exclusion).
- **Idempotency:** partial unique index on `(channel_id, sender_id, client_request_id)` (`20260817144037_backend_command_schema.sql:22-24`) backs the RPC replay lookups (`issue_335:75-86,262-272`); replay scoped to sender+channel, so a leaked key can't mint someone else's message.
- **Direct-write vs RPC parity:** messages INSERT policy mirrors the command path (archived/membership/sender/type/reply/whisper checks, `20260817144037:44-67`) with `system`/`dice_roll` client-uninsertable (`:51`); routing immutability (`20260812120000:57-93`); member field bounds + `npc_name` ≤40 as CHECKs (`20260818140000:43-85`); mention ids constrained at the data layer (`20260826151307_harden_mention_user_ids_insert.sql`); and the new DB-level 4000-char content cap closes the paste-flood bypass with NOT VALID done right (`20260906101600_messages_content_length_cap.sql:11-14`).
- **Orphan-channel safety:** `update_channel_settings` uses `IS DISTINCT FROM` for the GM check (`issue_335:463`); GM-transfer restricted to existing members with orphan-claim preserved (`20260901120000_issue_337_gm_transfer_guard.sql`); account-deletion orphan handling (`20260813140000`).
- **Push pipeline:** shared secret hashed-then-compared constant-time (`supabase/functions/push-notifications/index.ts:43-55`); trigger payloads carry ids only, content re-fetched server-side (`index.ts:87-146`); whisper routing exclusive to the target with content-free body (`filter.ts:112-133`); mention routing intersected with non-blocked membership including the `all` expansion (`filter.ts:191-202`); suspended-GM announcement filter (`index.ts:223-230`); 404/410-only subscription cleanup with bounded retry and content-free delivery log (`index.ts:395-438`).
- **cleanup-images:** secret-gated POST-only, retention 0 = no-op, audited batches (`supabase/functions/cleanup-images/index.ts:9-46`).
- **Storage:** `images` bucket private with member-only SELECT keyed on the UUID first path segment — malformed/traversal paths fail the uuid cast and are denied (`20260826160000_secure_images_bucket.sql:17-27`); GM-only INSERT/UPDATE/DELETE (`20260814194631_add_channel_avatar.sql:23-39`); server-side enable/size/mimetype trigger (`20260826160000:33-83`).
- **X-Card:** GM-only SELECT keeps flags anonymous (`20260811120000:56-58`); the new resolution flow blocks pre-resolved inserts by flaggers and keeps resolution GM-only (`20260906095225_safety_card_event_resolution.sql:11-23`).
- **Client secrets & telemetry:** only the anon key ships client-side (`src/lib/supabase.ts:5-12`); env Zod-validated (`src/env.ts:3-9`); VAPID private key edge-function-only (`index.ts:367-373`); GA sends pathname only (`src/lib/analytics.ts:50-56`); Sentry masks all replay text and scrubs URLs (`src/lib/sentry.ts:8-28,41-43`); SW push payloads Zod-parsed with safe-integer badge bounds (`src/sw.ts:41-52`, `src/lib/swPush.ts:7-16`).
- **Headers/config:** CSP now carries `base-uri 'self'; form-action 'self'; object-src 'none'` plus `frame-ancestors 'self'` and `X-Frame-Options` (`public/_headers:2-3`); `max_rows = 1000` (`supabase/config.toml:11`); function auth documented at `config.toml:13-31`.
- **Privacy:** export is complete for access/portability (profile, memberships, authored messages incl. whispers, dice, reactions, prefs, own abuse reports, authored admin messages — `src/features/auth/exportUserData.ts:75-159`); policy copy matches actual telemetry, and masking now over-satisfies the recording disclosure (`src/features/auth/PrivacyPage.tsx:55,60`).
- **Unread RPCs are RLS-bounded:** `get_unread_totals` is invoker-rights and service-role-granted (`20260813120000_get_unread_totals.sql:5-22`; the sweep's re-grant to authenticated is harmless — content filtering is RLS); `get_admin_unread_count` is self-or-admin guarded (`issue_335:677-695`).

---

## Intentional exclusions

Carried from `docs/audit/20260904/INDEX.md` and re-verified deliberate — do not "fix":

- **`verify_jwt = false` on `push-notifications`/`cleanup-images` with shared-secret auth** (`supabase/config.toml:13-31`) — the DB trigger is the intended sole caller; secret now unreadable by API roles.
- **Whisper privacy model:** sender + target + GM visibility by RLS (`20260801101940_fix_rls_recursion.sql:65-74`); push bodies content-free (`filter.ts:55-57,112-117`); received whispers excluded from GDPR export (`src/features/auth/exportUserData.ts:69-74`).
- **Client-side PBKDF2 with DB-side compare and authenticated `get_channel_salt`** (`20260812120000:8-30`) — plaintext never reaches the DB; salt treated as non-secret.
- **Mimetype is label-only on image uploads** — documented ceiling + client-side JPEG re-encode (`20260826160000:63-74`).
- **CSP `script-src 'unsafe-inline'`** — nonce-ification remains an explicitly deferred optional follow-up (sec-20260904#9 fix scope was the drop-ins).
- **X-Card events anonymous-by-design** — INSERT-only for players with no reporter column; GM resolve UPDATE does not change anonymity (`20260906095225:9-23`).
- **GM NPC posting and client-hashed channel passwords** — core product design, authorized server-side.
- **Open signup with no invite gate; distributed brute-force residual** — per-IP limiting unreachable from Postgres; shipped per-account throttle is the right scope.
- **Soft-delete-only messages** — rows and (previously public) previews persist after deletion.
- **Stale previews after edits/whisper-nulling** — preview intentionally reflects the latest *inserted* non-whisper message; edit/delete do not recompute (safe direction, verified above).
- **Image retention defaults to 0 (no-op cleanup)** — cost posture choice; scheduler respects `app_settings`.
- **Free-form initiative, public-only dice, single timeline, offline = cached shell, Iconify external API** — product choices from prior pillars, unchanged.

---

## Suggested execution order

1. **P2 #1** — `get_user_channels_unread` self-guard (+ pgTAP). One line; closes a cross-user metadata read.
2. **P2 #3** — `mark_admin_thread_read` participation check (+ pgTAP). Small; completes the admin-comms contract.
3. **P2 #5** — sweep extension over trigger/definer helpers + `has_function_privilege` assertions. Mechanical; permanently closes the class the sweep started.
4. **P2 #2** — NPC avatar scheme validation (extend `url_scheme_allowed` to `channel_npcs`/`messages.npc_avatar_url`) + length caps + scrub.
5. **P2 #4** — SW push-URL same-origin refine + test.
6. Batch 1–5 in one chore PR; no ordering dependency between them.
