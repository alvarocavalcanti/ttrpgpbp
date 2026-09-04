# Security & Data Integrity Audit — 2026-09-04

## Audit Prompt

> You are an Application Security Engineer auditing a multiplayer Play-by-Post TTRPG web app (React + Supabase). This is a RESEARCH + REPORT task: you must NOT modify any code. Your only file output is the audit report itself.
>
> Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260904 (a git worktree — treat it as the repo root).
>
> AUDIT CONTRACT (applies to every finding):
>
> - Read-only audit. Do NOT modify any file except your single report file. Do NOT run `gh` or any git command. Do NOT run tests, builds, or database commands.
> - Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files (grep/read tools).
> - Every finding must cite evidence as `file:line` (relative to repo root). No evidence = no finding. Verify every claim against actual code/migrations, not docs or changelogs.
> - Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
> - Baselines — read these first, do NOT re-report remediated items:
>   - docs/audit/20260831/phase4_audit.md (remediation matrix + P1 blocker list; treat [VERIFIED STABLE] rows as closed unless you find a regression; the 3 P1 launch blockers listed there are already tracked — verify whether they were fixed since and mark [OPEN] or [FIXED] accordingly)
>   - docs/audit/20260831/ux_audit.md
>   - docs/audit/20260828/phase3_audit.md
> - Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID e.g. `phase4#P1`, `phase2#P1`), or [INTENTIONAL] (deliberate product choice — list separately under Intentional Exclusions, do not propose fixes).
> - Stack: React 19, Vite, TypeScript, hand-rolled Tailwind (no Shadcn), Supabase (Postgres/RLS/Realtime/Edge Functions), PWA, Node 26.
>
> YOUR PILLAR — Security & data integrity. Audit the trust boundary end to end:
>
> 1. RLS policies and their helper functions (`is_channel_member`, `is_suspended`, `is_channel_gm`, `is_server_admin`) in supabase/migrations/.
> 2. SECURITY DEFINER RPCs: `send_message`, `roll_dice`, `join_channel`, `update_channel_settings`, `set_active_players`, `get_admin_unread_count`, mention/push trigger functions. Check for: inline membership checks missing `is_suspended`/`is_blocked`, orphan-channel edge cases (`NULL` gm_id), privilege escalation via direct-table writes vs RPC path divergence, replay/idempotency abuse.
> 3. PUBLIC-executable SECURITY DEFINER helpers missing `REVOKE ... FROM PUBLIC` (phase4 flagged `is_suspended`, `is_active_gm`, `resolve_mention_user_ids`, `get_admin_unread_count` — verify current state).
> 4. Brute-force/abuse oracles: `join_channel` password attempt throttling (phase4 flagged unthrottled oracle — check if a fix migration landed), suspension bypass, rate limits.
> 5. The `push-notifications` edge function: JWT verification, CORS, payload trust, content leaks (whisper privacy, push bodies), mention routing (membership intersection), subscription cleanup.
> 6. Storage: `images` bucket policies (private bucket, member-only SELECT, server-side upload enforcement trigger), path traversal in storage keys.
> 7. Client-side secrets handling: src/lib/, src/env.ts (Zod), service worker (src/sw.ts, src/lib/swPush.ts), anything logging sensitive data (Sentry/GA scrubbing — phase4 marked stable, spot-check).
> 8. HTTP headers/security config: supabase/config.toml, public/_headers (frame-ancestors, X-Frame-Options — phase4 says fixed, verify).
> 9. Privacy: GDPR export completeness, data retention (cleanup-images), privacy policy vs actual telemetry (GA/Sentry env-gating).

---

**Date:** 2026-09-04
**Scope:** Security & data integrity pillar — RLS + helper functions, SECURITY DEFINER RPCs, function grants, abuse oracles, push-notifications edge function, storage, client secrets/SW, HTTP headers/config, privacy (GDPR export, retention, telemetry). Baselines: phase4_audit.md (2026-08-31), ux_audit.md (2026-08-31), phase3_audit.md (2026-08-28).
**Verification commands run:**

- `npx tsc -p tsconfig.app.json --noEmit` → **passed** (no errors)
- `npx oxlint` → **passed** (clean)
- No tests, builds, DB commands, git or `gh` commands run (per contract). All claims verified by reading migrations, edge functions, and client source.

---

## Executive Summary

No P0 findings. All three phase4 P1 launch blockers are **fixed and verified in code** (`20260831140000_issue_335_authz_hardening.sql`), each with pgTAP coverage; the three phase4 sync P1s are also fixed. The remediation quality remains high.

Two new P1s, both narrow:

1. **Whisper content leaks to every channel member** via the lobby preview added today: the `last_message_preview` trigger stores the first 120 chars of *any* new message — whispers included — on the `channels` row, which is member-wide readable (and realtime-broadcast). The messages-RLS whisper restriction is bypassed by a side table. One small migration fixes it.
2. **The push shared secret is readable by any anon/authenticated caller.** `push_notification_config_value()` revokes only `FROM PUBLIC`, which does not strip Supabase's default-privilege EXECUTE grants to `anon`/`authenticated` — the exact trap the project itself documented and fixed for four other helpers in issue_335, plus pgTAP asserts anon=privilege-false for those four. This one was missed. With the anon key (public in the bundle) anyone can read `PUSH_INTERNAL_SECRET` and forge trigger calls to `push-notifications` (which runs with `verify_jwt = false`), re-pushing any existing message to its legitimate recipients — spam/cost vector, no cross-trust-boundary read.

The systemic root of #2 is that **every `REVOKE … FROM PUBLIC` in the repo leaves anon/authenticated EXECUTE intact** (no `ALTER DEFAULT PRIVILEGES` anywhere). Most functions are guarded by `auth.uid()`/`is_server_admin()` so impact is nil, but a one-migration grant sweep closes the whole class. Remaining P2s: member-authored URLs skip the scheme validation channels have, Sentry session replays capture chat DOM text (policy-disclosed, maskable in one line), GDPR export misses the reporter's own abuse reports, plus small hygiene items.

---

## P0

None.

---

## P1

### 1. Whisper content leaks to all channel members via `channels.last_message_preview` [NEW]

**Evidence:**

- `supabase/migrations/20260904111055_channel_last_message_preview.sql:26` — trigger stores `last_message_preview = left(new.content, 120)` for **every** inserted message, with no whisper exclusion (and `:6-13` backfills previews from the latest message, so historical whispers are already exposed).
- `supabase/migrations/20260801101940_fix_rls_recursion.sql:42-45` — `channels` SELECT policy is member-wide (`is_channel_member(id)`); `:65-74` — the messages policy that keeps whispers from non-target members (`whisper_to IS NULL OR whisper_to = auth.uid() OR sender_id = auth.uid() OR is_channel_gm`).
- `src/features/channels/Lobby.tsx:203` — preview rendered to every member in the lobby list (`channelPreview(channel.last_message_preview)`).
- `supabase/migrations/20240801000000_init_schema.sql:241` — `channels` is in the `supabase_realtime` publication, so previews also ride the websocket to every member.

**Problem:** The lobby preview feature (shipped 2026-09-04) copies the first 120 characters of each new message — including whispers — onto the `channels` row. A member who is not the whisper target cannot SELECT the whisper from `messages`, but sees its content in the lobby (REST and realtime). This defeats the whisper confidentiality model at the data layer, and the backfill means existing channels already carry whisper previews.

**Fix:** In the trigger, null the preview for whispers (e.g. `last_message_preview = CASE WHEN new.whisper_to IS NULL THEN left(new.content, 120) END`), recompute existing previews from each channel's latest non-whisper message, and add a pgTAP case (insert whisper → preview is NULL / keeps previous value). Consider the same guard for the `WHEN` clause (`execute function ... when (new.whisper_to is null)`) — but the CASE form keeps `last_message_at` advancing for whispers, which unread counting needs.

**Effort:** ~15-line migration + pgTAP. Half a day.

### 2. Push shared secret readable by any anon/authenticated caller (`push_notification_config_value`) [NEW]

**Evidence:**

- `supabase/migrations/20260814120000_server_side_push_trigger.sql:37-46` — the SECURITY DEFINER helper that returns `push_notification_config` values is revoked **only** `FROM PUBLIC`; no explicit `anon`/`authenticated`/`service_role` revoke.
- `supabase/migrations/20260831140000_issue_335_authz_hardening.sql:696-697` — the project's own comment states the Supabase platform default grants EXECUTE on new functions to `anon`/`authenticated`/`service_role` explicitly, so "REVOKE FROM PUBLIC alone is not enough"; `supabase/tests/20260831140000_issue_335_authz_hardening.sql:135-137` asserts `has_function_privilege('anon', …) = false` for the four helpers it fixed — proving the distinction is real and testable. No migration fixes `push_notification_config_value` (only occurrence of a revoke on it is `20260814120000:46`).
- `supabase/config.toml:13-18` — `push-notifications` runs `verify_jwt = false`; `supabase/functions/push-notifications/index.ts:273-276` — the shared secret (`x-push-secret`) is the only auth.

**Problem:** With the app's public anon key, anyone can call `POST /rest/v1/rpc/push_notification_config_value` with `{'p_key':'PUSH_INTERNAL_SECRET'}` and read the secret, then forge trigger invocations (`{'table':'messages','message_id':…}`) for any message id. The function re-pushes that message's (content-bearing, truncated to 100 chars) body to its legitimate recipients: notification spam, replay of stale messages, VAPID/push-provider cost burn, `push_delivery_log` pollution. No cross-channel content exposure (recipients are computed from the referenced message's channel), which is why this is P1, not P0.

**Fix:** One migration:

```sql
REVOKE ALL ON FUNCTION public.push_notification_config_value(text)
  FROM PUBLIC, anon, authenticated, service_role;
```

Trigger functions run with owner privileges and are unaffected (same pattern as issue_335 for `is_suspended`). Add `has_function_privilege` pgTAP assertions to the existing issue_335 test file.

**Effort:** 1-line migration + ~6 test lines. Under an hour.

---

## P2

### 3. Class fix: every `REVOKE … FROM PUBLIC` leaves anon/authenticated EXECUTE [NEW]

**Evidence:** No `ALTER DEFAULT PRIVILEGES` in any migration (`grep` across `supabase/migrations/` returns none); 30+ functions use the bare `REVOKE … FROM PUBLIC` pattern, e.g. `supabase/migrations/20260816000000_push_delivery_logs.sql:102` (`retry_failed_push_invocations`), `20260812130000_blocking_revokes_access_and_join_preview.sql:76` (`get_join_channel_preview`), `20260812120000_secure_passwords_and_field_immutability.sql:29` (`get_channel_salt`), `20260831140000_issue_335_authz_hardening.sql:381` (`send_message`), `20260817144038_backend_command_roll_dice.sql:201` (`roll_dice`).

**Problem:** Residual anon/authenticated EXECUTE on all of them. Consequences by function: `retry_failed_push_invocations` — any authenticated user can re-dispatch up to `p_max` failed pushes per call with no admin gate or throttle (`20260816000000_push_delivery_logs.sql:54-102`); `get_join_channel_preview` — unauthenticated enumeration of invite-code channels' `name`/`game_system`/`has_password` (`20260812130000:55-74`); `get_channel_salt` — unauthenticated salt retrieval for any channel (only useful for precomputation if a `channel_secrets` hash ever leaks — the hash itself is GM-only and the online oracle is now throttled, so impact is low); the command RPCs and admin RPCs raise on `auth.uid() IS NULL` / `is_server_admin()` and are unaffected in practice.

**Fix:** One hygiene migration that explicitly revokes `anon, authenticated` (and `service_role` where relevant) from every non-frontend definer/invoker function, keeping the existing `authenticated` grants where the app calls them. Mechanical: enumerate `pg_proc` entries in `public`, keep the current grant list, strip anon. pgTAP: a `has_function_privilege` sweep (the pattern already exists in `supabase/tests/20260831140000_issue_335_authz_hardening.sql:135-140`). Nothing in `src/` calls `retry_failed_push_invocations` or `push_notification_config_value` (verified — only generated types reference them).

**Effort:** 1 migration + 1 test sweep. Half a day.

### 4. Member-authored URLs skip the scheme validation channels have [NEW]

**Evidence:** `enforce_url_scheme` covers only `channels.map_url/resources_url/safety_tools_url/avatar_url` (`supabase/migrations/20260831150000_issue_337_privacy_db_hardening.sql:663-683`, refined in `20260901195145_fix_url_scheme_relative_paths.sql:19-35` and `20260902091743_fix_url_scheme_whitespace.sql:13-43`); `channel_members.character_sheet_url` / `character_avatar_url` get length caps only (`supabase/migrations/20260818140000_enforce_mutation_integrity.sql:89-101`), and the client renders the sheet URL raw: `src/features/channels/MemberList.tsx:203-211` (`<a href={member.character_sheet_url}>`).

**Problem:** A member can set `character_sheet_url` to an exotic-scheme value every other member sees as a "Sheet" link. Primary mitigations already in place: React 19 blocks `javascript:` URLs in href (react ^19.2.8, `package.json:22`) and browsers block `data:` top-level navigation — so this is defense-in-depth, not an open XSS. But the DB contract is inconsistent: identical fields are validated on `channels` and not on `channel_members`, and the app shouldn't lean on the framework for scheme safety.

**Fix:** Extend the URL validation to `channel_members.character_sheet_url/character_avatar_url` (reuse the normalized scheme check; relative storage paths must keep passing, per `20260901195145`). Optional client belt: allowlist `http(s):` before rendering the href.

**Effort:** Small migration + one client guard. Half a day.

### 5. Sentry session replays capture chat DOM text, whispers included [NEW]

**Evidence:** `src/lib/sentry.ts:44-45` — `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`; `src/lib/sentry.ts:12-28` — `beforeSend` scrubs URLs only, not DOM text; `src/features/auth/PrivacyPage.tsx:60` — the policy discloses "a screen recording of about 1 in 10 sessions … and of every session where an error occurs".

**Problem:** Session replays record the rendered DOM, so message/whisper text (and character notes) can leave the device to a third-party processor. Consent-wise this is covered by the policy disclosure, so it is hardening, not a compliance defect. Whisper content in particular was judged lock-screen-sensitive elsewhere (`supabase/functions/push-notifications/filter.ts:55-57`); the same bar should apply to replays.

**Fix:** `replayIntegration({ maskAllText: true })` (one line; input masking is already Sentry default), or block message-list selectors. Verify error diagnosis still works with masked text.

**Effort:** One line + a manual check.

### 6. GDPR export omits the reporter's own abuse reports and authored admin messages [NEW]

**Evidence:** `src/features/auth/exportUserData.ts:60-99` exports profile, memberships, authored messages, dice rolls, reactions, prefs — nothing else. `supabase/migrations/20260819130000_abuse_controls.sql:100-101` — `abuse_reports` SELECT is admin-only, so a reporter cannot even read back their own report; `supabase/migrations/20260821160948_20260821000000_admin_gm_comms.sql:77-95` — authored `admin_messages` are readable via RLS but not exported.

**Problem:** Right-of-access completeness: the reporter's own report content (reason text) is personal data the user cannot obtain through the app, and authored admin-thread messages are missing from the export. No data loss; gap is completeness.

**Fix:** Add a `FOR SELECT USING (reporter_id = auth.uid())` policy on `abuse_reports` (admins keep theirs), and append `abuse_reports` + authored `admin_messages` sections to `buildUserDataExport` (the pagination helper already exists). Update the export test.

**Effort:** Half a day.

### 7. `set_channel_last_message_at` is SECURITY DEFINER without a pinned `search_path` [NEW]

**Evidence:** `supabase/migrations/20260904111055_channel_last_message_preview.sql:18-30` — `LANGUAGE plpgsql SECURITY DEFINER` with no `SET search_path` (the recreated trigger function dropped the pin that other definer functions carry).

**Problem:** Same Supabase-linter class phase4 flagged for `handle_new_user` (`phase4#P2`, "Pin `search_path`"): a mutable search_path on a definer function is a privilege-hygiene defect.

**Fix:** Add `SET search_path = public` to the function (one line in a new migration; never edit the merged one).

**Effort:** One line.

### 8. Announcement pushes target suspended GMs [NEW]

**Evidence:** `supabase/functions/push-notifications/index.ts:215-222` — announcement targets are raw `channels.gm_id` over all non-archived channels; `supabase/migrations/20260831140000_issue_335_authz_hardening.sql:665-674` — `is_active_gm` deliberately excludes suspended GMs (and `get_admin_unread_count`/admin RLS follow that rule).

**Problem:** Inconsistency introduced by the suspension work: a suspended GM's devices still receive announcement pushes for channels they can no longer read (RLS denies), and their badge counts drift from the in-app unread badge.

**Fix:** Filter the gm list by `NOT is_suspended(gm_id)` (small SQL RPC the function already calls, or a `profiles` join in the function query).

**Effort:** Small.

### 9. CSP lacks `base-uri`/`form-action`; `script-src` carries `unsafe-inline` [NEW]

**Evidence:** `public/_headers:2` — `default-src 'self'; … script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; …` (no `base-uri`, no `form-action`, no `object-src`).

**Problem:** With React 19 blocking `javascript:` URLs and no `innerHTML` sinks found (react-markdown's default URL transform sanitizes links — verified `src/components/MarkdownImpl.tsx:11-16`), XSS surface is small, but `unsafe-inline` neutralizes script-src as an injection backstop, and missing `base-uri`/`form-action` leave classic escalation primitives open.

**Fix:** Add `base-uri 'self'; form-action 'self'; object-src 'none'` (drop-in). Replacing `unsafe-inline` with a nonce/hash set is possible (gtag bootstrap + Vite inline module) but fiddly with workbox precaching — treat as optional follow-up, not now.

**Effort:** One line for the drop-ins; a day for nonce-ifying scripts.

---

## What's sound — do not touch

- **Phase4's three P1 launch blockers are fixed and tested** (`20260831140000_issue_335_authz_hardening.sql` + `supabase/tests/20260831140000_issue_335_authz_hardening.sql`):
  - Suspension guards up-front in `send_message` (`:257`), `roll_dice_unchecked` (`:70`), `set_active_players` (`:400`), `update_channel_settings` (`:455`), plus suspended whisper/active-player *targets* refused (`:319`, `:355`, `:413`); `join_channel` refuses suspended callers (`:562`).
  - Join oracle throttled: per-user+channel windowed counter, 5 failures / 10 min, self-cleaning rows, successful join clears history (`:511-613`); `channel_join_failures` has RLS with no policies plus table grants revoked (`:522-523`).
  - The four PUBLIC helpers fully revoked (`:698-701`) with grants restored only where the frontend legitimately calls (`:706-708`), `get_admin_unread_count` guarded to self-or-admin (`:686-688`), `is_active_gm` ignores suspended GMs (`:665-674`). pgTAP asserts privilege state directly (`tests:135-140`).
- **Phase4's three sync P1s fixed:** reconnect catch-up reconciles UPDATEs (`src/features/chat/useMessages.ts:104`); `last_read_at` advances via the messages-INSERT listener with serialized monotonic writes (`src/features/channels/useChannel.ts:28-50`); SW offline navigation fallback via `NavigationRoute` (`src/sw.ts:23`).
- **X-Card privacy:** GM-only SELECT with inlined predicate (`20260831150000:36-44`); anonymity holds by schema (no reporter column, `20260811120000_afk_and_safety_tools.sql:44-47`).
- **Membership integrity:** force-adding members blocked by consent trigger (`20260831150000:50-65`); direct self-join INSERT policy dropped since `20260731172409:2`; attributes clamped on all authenticated writes (`20260831150000:71-115`); gm_id transfer restricted to existing members, orphan-claim preserved (`20260901120000_issue_337_gm_transfer_guard.sql:18-54`).
- **Command-path equivalence:** direct `messages` INSERT policy mirrors the RPC (archived/membership/sender/type/reply/whisper checks, `20260817144037:44-67`); direct `dice_rolls` INSERT has no policy (`:32`); `mention_user_ids` constrained at data layer for every path (`20260826151307:14-39`); idempotency race closed with `unique_violation` fallback in both RPCs (`20260831150000:365-386, 551-567`); `update_channel_settings` uses `IS DISTINCT FROM` for orphan channels (`20260826120000:93`).
- **Push pipeline:** trigger→function payloads carry ids only, content re-fetched server-side (`index.ts:91-146`); whisper routing exclusive and body content-free (`filter.ts:112-117, 130-133`); mention routing intersected with non-blocked membership (`filter.ts:191-202`); timing-safe secret compare (`index.ts:43-55`); 404/410-only subscription cleanup, bounded retry, content-free delivery log (`index.ts:395-429`, `20260816000000:13-32`); `push_subscriptions`/`notification_preferences` own-row RLS (`20260802000000:21-23`).
- **Storage:** `images` bucket private (`20260826160000:17`); member-only SELECT keyed on the UUID path segment through `is_channel_member` (`:22-27`) — a malformed/traversal path fails the uuid cast and is denied; GM-only INSERT/UPDATE/DELETE (`20260814194631:23-39`) matching the GM-only upload UI (`src/features/chat/MessageComposer.tsx:295-316`); server-side enable/size/mimetype trigger (`20260826160000:33-83`); `cleanup-images` timing-safe secret, retention 0 no-op, audited batches (`supabase/functions/cleanup-images/index.ts:9-46`).
- **Client secrets:** only the anon key client-side (`src/lib/supabase.ts:5-12`); env Zod-validated (`src/env.ts`); VAPID private key server-only (`index.ts:359-364` vs `VITE_VAPID_PUBLIC_KEY`); no sensitive console logging; GA page-path-only with search stripped (`src/lib/analytics.ts:50-56`); Sentry URL scrubbing (`src/lib/sentry.ts:8-28`); push payload Zod-parsed in the SW (`src/lib/swPush.ts:7-16`, `src/sw.ts:43`); localStorage wrapped no-throw (`src/lib/safeStorage.ts`).
- **Headers:** `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` present (`public/_headers:2-3`) — phase4 item verified.
- **Clickjacking-adjacent markdown:** react-markdown default URL transform neutralizes exotic schemes in message links (`src/components/MarkdownImpl.tsx:11-16`).
- **Account lifecycle:** delete-account resolves the user from the verified JWT, blocks admins from self-deleting, cascades are intentional (`supabase/functions/delete-account/index.ts:51-81`).
- **Frame/DB config:** `max_rows = 1000` (`supabase/config.toml:11`); admin RPCs gated by `is_server_admin()` (`20260815150242:24`, `20260822113916:18`); `server_admin` column escalation trigger + column grant revoked (`20260812120000:41-45`, `20260812170000:65`); profiles SELECT is public but email was dropped and sensitive fields hidden (`20260812170000:49`).
- **Residual, accepted:** distributed brute-force across many throwaway accounts still works within the per-account throttle (per-IP limiting isn't reachable from Postgres; signup is open by design) — the shipped windowed throttle is the right scope for current scale.

---

## Intentional exclusions

Deliberate product/design decisions found and verified — do not "fix":

- **`verify_jwt = false` on `push-notifications` / `cleanup-images` with shared-secret auth** (`supabase/config.toml:13-31`) — documented decision; the DB trigger is the intended sole caller. (The grant hygiene to keep the secret non-readable is P1 #2, which is a fix, not a redesign.)
- **Whisper privacy model:** whispers visible to sender + target + GM by RLS (`20260801101940:65-74`); push body content-free by design (`filter.ts:55-57`); received whispers deliberately excluded from GDPR export (`src/features/auth/exportUserData.ts:56-59`).
- **Client-side PBKDF2 with DB-side compare and client-fetched salt** (`src/lib/crypto.ts`, `20260812120000:8-30`) — chosen so plaintext passwords never reach the DB; the salt is treated as non-secret. Only the grant hygiene (P2 #3) is recommended, not a KDF relocation.
- **Mimetype is label-only on image uploads** — in-migration `ponytail` comment documents the ceiling and the client-side JPEG re-encode mitigation (`20260826160000:63-74`).
- **X-Card events are INSERT-only for players** (no read-back) — anonymity over realtime replay convenience (`20260831150000:4-10`).
- **GM can post as NPCs and set channel passwords client-hashed** — core product design, consistently authorized server-side.
- **Open signup (Google/email) with no invite gate** — product choice; abuse controls are tuned to it.

---

## Suggested execution order

1. **P1 #2** — revoke `push_notification_config_value` from anon/authenticated (+ privilege assertions). One line; removes a public read of an auth secret.
2. **P1 #1** — whisper-proof the `last_message_preview` trigger + backfill scrub + pgTAP. Small, and it's a privacy regression in a feature that just shipped.
3. **P2 #3** — the grant sweep migration closing the whole `FROM PUBLIC` class (folds in `retry_failed_push_invocations`, `get_join_channel_preview`, `get_channel_salt`).
4. **P2 #6** — abuse_reports read policy + export additions (completeness, cheap).
5. **P2 #4** — scheme validation for member URLs (defense-in-depth; client guard included).
6. **P2 #5, #7, #8** — replay masking, `search_path` pin, suspended-GM push filter: three one-liners, batch in one chore PR.
7. **P2 #9** — CSP `base-uri`/`form-action`/`object-src` drop-ins now; nonce-ify scripts later if ever.
