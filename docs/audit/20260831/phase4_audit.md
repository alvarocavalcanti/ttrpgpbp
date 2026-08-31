# Phase 4 Codebase Audit — 2026-08-31

Re-audit of `alvarocavalcanti/ttrpgpbp` (React / TypeScript / Vite / Tailwind / Shadcn UI / Supabase). Verifies remediation of the Phase 3 audit (`docs/audit/20260828/phase3_audit.md`, verdict GO) and re-sweeps the five audit pillars. Read-only analysis: no code changed.

Verification run this pass:

- `tsc --noEmit -p tsconfig.app.json`: **passed** (no errors)
- `npm run lint` (oxlint): **passed** (clean)
- `vitest run`: **952 passed / 0 failed**
- `npx vite build`: **passed** (58 precache entries, 3.42 MiB — see P2 precache bloat)
- Node 26 synced: `.nvmrc` = `26`, CI `node-version: '26'`
- `.env` hygiene: `.env` / `.env.local` untracked (gitignored), only `.env.example` tracked; client references anon-key + public keys only, `env.ts` Zod-validated

## 1. Remediation Verification Matrix

| Remediation | Status | Rationale |
|---|---|---|
| Server-authoritative dice, atomic roll persistence | [VERIFIED STABLE] | `roll_dice` definer RPC: regex-gated notation, 100-dice/1000-sides caps, modifier clamped to game-system bounds, message+dice_rolls inserted atomically in one txn, direct `dice_rolls` INSERT revoked; client never computes a displayed result (`useMessages.ts:426-459`, `MessageItem.tsx:381`). Residual P2: notation length unbounded in content; concurrent same-key replay hits a unique violation instead of replaying the row (race-only, client retry recovers). |
| Drafts and reliable sending | [VERIFIED STABLE] | Idempotency key (`client_request_id`) + partial unique index `(channel_id, sender_id, client_request_id)`; RPCs return existing row on replay; retry reuses key; draft cleared only after successful send, retained on failure (tested). Residual P2: composer-resubmit mints a fresh key, so a timeout-then-resend can double-post. |
| Security hardening (active-player flip, self-suspend, GM-less channel edits) | [INCOMPLETE] | Direct-table writes are trigger+RLS locked. But the command RPCs (`send_message`, `roll_dice`, `update_channel_settings`, `set_active_players`) are SECURITY DEFINER and their inline membership checks filter `is_blocked` only — `is_suspended` (enforced in `is_channel_member()`) is bypassed on the RPC path. A suspended account keeps posting and rolling. |
| Images in private channels stay private | [VERIFIED STABLE] | `images` bucket private; member-only SELECT on `{channel_id}/...` paths; `enforce_image_upload_rules` definer trigger re-enforces enable toggle, size cap, `image/*` server-side on every write; pgTAP 7/7. Residual (accepted, in-migration): mimetype is label-only, client re-encodes to JPEG. |
| Push delivery hardening | [VERIFIED STABLE] | DB-trigger dispatch, 404/410-only subscription cleanup, bounded backoff retry, per-delivery `push_delivery_log` (never message content/push keys); subscription self-repair on foreground + SW rotation relay; whisper routing exclusive to `[whisper_to]` with content stripped. |
| Realtime connection recovery | [INCOMPLETE] | `subscribeWithRetry` (exp backoff 1s→30s, `src/lib/realtime.ts`) + global status banner are solid; echo-dedup by id, `client_request_id` race solved, cursor-based forward catch-up (PAGE_SIZE batches) recovers >50 missed inserts. But catch-up only forward-fetches `INSERT` (`gt('created_at', cursor)`): missed **UPDATE/DELETE** events during a disconnect never reconcile already-held messages — an edit/deletion made while offline stays stale until full reload. Admin-message channels use bare `.subscribe()` (no retry) and die silently on drop. |
| Admin/GM communication | [VERIFIED STABLE] | Thread RLS sound (announcements: admin/active-GM; DMs: admin/participant); composite-cursor pagination + indexes; `retry_failed_push_invocations` routes admin retries correctly. Gap (P1): `get_admin_unread_count()` is PUBLIC-executable with no caller guard — any caller reads an arbitrary user's admin-thread unread state. |
| X-Card (anonymous, GM alert) | [REGRESSION RISK] | `safety_card_events` is in the realtime publication with member-wide SELECT RLS — **every player's websocket receives every X-Card event**; GM-only surfacing is client-side UI. Anonymity holds (no identity stored) but flag events leak to non-GMs. In-migration comment admits the tradeoff. |
| Private channels, password separation, blocking | [INCOMPLETE] | Separation correct; blocked users excluded from channel access. But `join_channel` compares `password_hash` with no attempt limiting (`20260819140000_join_channel_return_json.sql:54`) — the "throttle failed password attempts" TODO in `20260819130000_abuse_controls.sql:106` was never implemented. Infinite brute-force oracle against channel passwords/invite codes. |
| NPC messages and roster validation | [VERIFIED STABLE] | GM-only RPC/RLS, roster snapshot validated server-side; past messages keep name/portrait snapshot. |
| AFK, safety tools, Lines & Veils | [VERIFIED STABLE] | RLS limits safety tools to members/GM; AFK suppresses "your turn" push server-side. |
| Character/input bounds | [VERIFIED STABLE] | DB enforces character-name 20, message 4000; all rolls server-authoritative so server clamps regardless of client. Residual P2: DiceRoller quantity accepts typed `9999` (spinner max only) and modifier is unclamped in UI — UX polish, server holds. |
| Dark mode, mobile modal fixes, scroll anchoring | [VERIFIED STABLE] | Implemented + tested. Residual P2: `visibilitychange→visible` force-jumps to divider/bottom even mid-history read. |
| Error surfacing | [VERIFIED STABLE] | Global ErrorBoundary renders friendly fallback, no raw stack to user, Sentry captured separately + scrubbed. Residual P2: single top-level boundary only — a ChannelView crash unmounts the whole tree incl. nav. |
| Private-by-default analytics & error reporting | [VERIFIED STABLE] | GA/Sentry env-gated (`VITE_GA_*`/`VITE_SENTRY_DSN`), unset → no-op; page-path only, search stripped; Sentry beforeSend scrubs; env read once via Zod. |
| Automated stability tests | [INCOMPLETE] | Unit layer green (952/0, coverage above thresholds). E2E harness still broken locally (Phase 3 #327 / #315). Supabase pgTAP gaps remain: no tests for `send_message`/`roll_dice`/`join_channel` happy paths, `channel_secrets`/`app_settings` write gates, admin RPC `is_server_admin` gates, `admin_messages` RLS, or the suspension RPC gap. |

## 2. Remaining Blocker Checklist (P0/P1)

**P0: none.**

**P1 (fix before launch):**

- **[P1] Suspension bypass in command RPCs** — `send_message` (`…44039:120`), `roll_dice` (`…44038:77`), `update_channel_settings` (`20260826120000:93`), `set_active_players` check `is_blocked` but not `is_suspended`. Add `AND NOT is_suspended(v_uid)` to the inline membership checks (SECURITY DEFINER bypasses RLS). ~4-line SQL + pgTAP.
- **[P1] Unthrottled join oracle** — `join_channel` (`20260819140000:54`) compares `password_hash` with no attempt limiting; the throttle TODO was never implemented. Add per-user/per-channel failure counter (windowed) inside the RPC.
- **[P1] PUBLIC-executable SECURITY DEFINER helpers** — `is_suspended`, `is_active_gm`, `resolve_mention_user_ids` (membership oracle), and `get_admin_unread_count` (reads arbitrary user's unread state) have no `REVOKE … FROM PUBLIC`. Add `REVOKE` + `auth.uid()` guard on the unread fn.
- **[P1] Reconnect catch-up misses UPDATE/DELETE** — `useMessages` forward-fetch only reconciles INSERTs; an edit/deletion made while offline stays stale until reload. Reconcile UPDATE/DELETE in the catch-up window.
- **[P1] `last_read_at` frozen while channel open** — written once on mount; messages arriving while the user is live-reading never advance it, so the Lobby unread badge re-counts already-read messages. Advance on new-message-while-visible.
- **[P1] SW lacks offline navigation fallback** — `precacheAndRoute` only; offline deep-link to `/channel/:id` fails. Add `createHandlerBoundToURL('index.html')` + NavigationRoute.

**Watch (not blockers):** X-Card broadcast to all members (decide: accept or move off realtime), GM can reassign `gm_id` to any profile (`20240801000000_init_schema.sql:68`), GM can add arbitrary users to a channel without consent, `member.attributes` JSONB unclamped on self-update.

## 3. Architecture & DX Optimization (P2)

- **Runtime validation parity** — chat/dice/push payloads are Zod-parsed (exemplary #305 pattern); legacy hooks (`useChannel`, members, prefs, search, admin flags) trust generated DB types blind. Migrate to the same `safeParse` pattern.
- **Precache bloat** — `vite.config.ts` glob `**/*.png` pulls every help screenshot + logo into the SW cache: 58 entries / 3.42 MiB. Scope to used screenshots; ~2.5 MiB mobile savings.
- **Per-route error boundaries** — single top-level boundary; wrap the 13 lazy routes (`App.tsx:16-31`) with a reusable boundary so a page crash doesn't unmount nav.
- **Composer double-send path** — composer-resubmit mints a fresh `client_request_id`; route re-send through the pending bubble's existing key so a timeout window can't double-post.
- **`dice:` href injection** — `[x](dice:<anything>)` passes raw to `roll_dice` (`MessageItem.tsx:143`); validate against `DICE_REGEX` at the click site.
- **DiceRoller input clamps** — quantity accepts typed `9999`, modifier unclamped; validate at point of input (project rule), not just server-side.
- **Pin `search_path`** on `handle_new_user` / `handle_new_user_prefs` (Supabase linter `function_search_path_mutable`).
- **DB hardening** — `roll_dice` notation length cap + DC bounds; `admin_messages` RLS depends on nested-RLS evaluation order (inline the predicate); `gm_id` tamper trigger; `p_invite_code` entropy/format validation; URL scheme validation on map/resources URLs; `abuse_reports.reason` length cap.
- **Edge-function hygiene** — timing-string secret compares (`crypto.subtle.timingSafeEqual`); `x-card` broadcast (F5) decision.
- **Fragile frontend patterns** — unguarded `localStorage` in composer (Safari private mode throws); non-null assertions (`user!.id`, `dataLayer!`); postMessage casts unchecked on the SW↔page DB-write path.
- **Lobby unread staleness** — badge refreshes only on push/visibility/realtime-status transitions; no messages subscription while in Lobby.
- **Scroll yank** — `visibilitychange→visible` force-jump violates the no-yank rule.
- **pgTAP gaps** — no coverage for command-RPC happy paths, `channel_secrets`/`app_settings` gates, admin authz, or the P1 suspension fix.

## 4. Final Deployment Verdict

**GO — conditional on P1 security items (suspension bypass, join throttle, PUBLIC definer helpers) landing before launch; the three sync P1s (UPDATE/DELETE catch-up, `last_read_at`, SW offline fallback) may ship in immediate follow-up.**

No P0 vulnerabilities. RLS matrix is sound across all tables; realtime whisper-leak check is clean (WALRUS respects SELECT RLS, whisper push copy strips content); build, type, lint, and 952-test suite all green; secrets hygiene clean. The three security P1s are narrow, well-localized SQL diffs (≈1 migration + 1 test file). The three sync P1s degrade UX (stale edits, phantom badges, offline deep-link) but lose no data and match no adversarial surface. Codebase remediation quality (trigger-guarded invariants, idempotent RPCs, tested edge cases) is well above bar — finish-line items, not structural debt.