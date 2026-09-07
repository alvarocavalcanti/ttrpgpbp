# PbP Realtime & Game-Loop Audit — 2026-09-07

## Audit Prompt

You are a Principal Engineer specializing in chat infrastructure, real-time systems, and Play-by-Post (PbP) TTRPG platforms (Myth-Weavers, Discord dice bots, RoleGate, Avrae). Audit asynchronous play correctness and the game loop of a React 19 + Supabase realtime chat app. This is a RESEARCH + REPORT task: you must NOT modify any code. Your ONLY file output is one audit report file (path below).

Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260907 (a git worktree — treat it as the repo root; set your workdir there).

AUDIT CONTRACT (applies to every finding):

- Read-only audit. Do NOT modify any file except your single report file: docs/audit/20260907/audit_pbp_realtime.md (directory exists). Do NOT run `gh` or ANY git command. Do NOT run tests, builds, or database commands.
- Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files (grep/read tools).
- Every finding must cite evidence as `file:line` (relative to repo root). No evidence = no finding. Verify every claim against actual code, not docs or changelogs.
- Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
- Baselines — read these first, do NOT re-report remediated items:
  - docs/audit/20260904/audit_pbp_realtime.md (your DIRECT predecessor — FIRST verify each of its findings P1.1, P1.2, P2.1–P2.4: mark [FIXED] or [OPEN] with file:line evidence of CURRENT state)
  - docs/audit/20260904/INDEX.md (deduped list + intentional exclusions — carry exclusions over)
  - docs/audit/20260815/audit_pbp_chat_ux.md (older predecessor — its [NEW]/[OPEN]/[INTENTIONAL] markers and "Intentional Scope Exclusions" carry over: hidden/GM rolls and initiative structure are INTENTIONAL, do not propose them)
  - docs/audit/20260831/phase4_audit.md, docs/audit/20260828/phase3_audit.md
- Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID e.g. `pbp-20260904#P1.1`, `chat-ux#1.6`), or [INTENTIONAL] (list separately under Intentional Exclusions, do not propose fixes).
- Stack: React 19, Vite, TypeScript, hand-rolled Tailwind (no Shadcn), Supabase (Postgres/RLS/Realtime/Edge Functions), PWA, Node 26.

YOUR PILLAR — PbP game & realtime UX:

0. FIRST — prior-finding verification. The 20260904 pbp findings (fixes landed ~2026-09-05, commit "Fix audit #404 — PbP game & realtime UX"; verify in code):
   P1.1 X-Card flags invisible to away GM — fix should add catch-up query + persisted dismissal (check how: new table? column? RPC? RLS correct? realtime + catch-up integrated?)
   P1.2 read-mark advances before history confirmed loaded + messages error banner lacks Retry (fix: gate markRead on messagesLoaded + Retry wiring)
   P2.1 composer resubmit mints fresh client_request_id after errored send (fix: reuse errored bubble's key)
   P2.2 no DB CHECK (char_length(content) <= 4000) on messages
   P2.3 composer Active Player single-select overwrites ensemble turn (fix: drop chip or multi-select)
   P2.4 draft-restore race clobbers destination channel draft on quick switch
   For each: [FIXED] with evidence, [OPEN], or [PARTIAL] with what remains.
1. Realtime subscription path: src/features/chat/useMessages.ts, src/features/channels/useChannel.ts, src/lib/realtime.ts, reconnect catch-up logic — including NEW safety-card catch-up subscription paths (race conditions between catch-up query and live INSERTs? double counting? dismissal sync across tabs/devices?).
2. Send reliability: optimistic echo, client_request_id idempotency, retry/remove states, draft persistence, double-send paths (verify the errored-bubble key reuse holds and no new hole appeared).
3. Dice integrity: server-authoritative roll_dice, client dice: link validation.
4. Unread/read-state correctness: last_read_at advancement, gating on successful load, unread divider resilience.
5. Offline/deep-link behavior: SW navigation fallback, offline banner quality.
6. Cross-channel stale-state guards on route change.
7. Game-loop product audit: whispers, NPC/scene/system message authority, active-player turn flow, safety tools/X-Card end-to-end (NOW including the new catch-up: does an away-GM flag survive reload? is dismissal per-GM? do players get false "all clear"?), message content caps, AFK handling.
8. PbP-specific affordances: "where was I?" continuity, catching up after days away, scroll anchoring through prepends, message context on errors.

REPORT STRUCTURE (markdown, this exact skeleton) in docs/audit/20260907/audit_pbp_realtime.md:

1. `## Audit Prompt` — reproduce this prompt verbatim (from "You are a Principal Engineer" through this bullet).
2. Header block: date 2026-09-07, scope, verification commands run + results.
3. `## Executive Summary` — short, blunt: is the load-bearing realtime wall still safe with the new safety-card state?
4. `## Prior findings disposition` — table P1.1–P2.4 with status + evidence.
5. `## P0` / `## P1` / `## P2` sections. Each finding: bold title, tag, evidence file:line, problem (frame for PbP play impact), concrete fix, rough effort. Order by return-on-effort within severity.
6. `## What's sound — do not touch`.
7. `## Intentional exclusions` (carry over chat-ux exclusions + new deliberate choices).
8. `## Suggested execution order`.

Recommendations must fit current scale — no speculative architecture, no new dependencies unless clearly justified. Respect prior intentional exclusions.

---

**Date:** 2026-09-07
**Scope:** PbP game & realtime UX pillar — verification of the 2026-09-05/06 fix wave (issue #404/#411/#412), the new safety-card catch-up state machine, realtime subscription/catch-up, send reliability, dice integrity, read-state, offline/deep-link, cross-channel guards, and the game-loop product surface (X-Card, active players, message authority, AFK, continuity).
**Baseline docs:** `docs/audit/20260904/audit_pbp_realtime.md` + `INDEX.md`, `docs/audit/20260815/audit_pbp_chat_ux.md`, `docs/audit/20260831/phase4_audit.md`, `docs/audit/20260828/phase3_audit.md`.

**Verification commands run:**

- `npx tsc -p tsconfig.app.json --noEmit` — **passed** (no errors)
- `npx oxlint` — **passed** (exit 0, no diagnostics)
- Read-only file inspection (grep/read) of `src/` and `supabase/migrations/` — no code modified, no tests/builds/DB/`gh`/git commands run.

## Executive Summary

Yes — the wall is still safe, and the new safety-card state does not weaken it. All six findings from 2026-09-04 are verifiably fixed in code: the X-Card now survives the away GM (persisted `resolved_at`, GM-only UPDATE RLS, SUBSCRIBED-gated catch-up count, fail-safe dismissal), the read-mark is gated on a confirmed history load with a working Retry, the composer resubmit reuses the errored bubble's idempotency key, the content cap is a DB constraint, the composer's Active Player chip is gone (modal is the single authority, and the RPC's `NULL` guard means ordinary messages can never touch turn state), and the draft-restore race is closed by a cleanup-order rewrite. The catch-up/live race analysis is clean: `Math.max` merging makes double-counting impossible in both directions, and there is no false "all clear" path — a failed dismissal restores the alert, a failed catch-up toasts instead of silently clearing.

What remains is three small P2s, none blocking: the dice-roll send path never got the errored-key reuse the message path got (the one remaining double-post window), the 7-day catch-up horizon can permanently swallow a flag for a GM away longer than a week, and X-Card dismissal doesn't propagate across a GM's own tabs/devices (stale-banner only, safe direction). No P0, no P1.

## Prior findings disposition

| ID | Finding | Status | Evidence (current state) |
|---|---|---|---|
| pbp-20260904#P1.1 | X-Card flags invisible to away GM | **[FIXED]** | New `resolved_at` column + GM-only UPDATE policy + INSERT WITH CHECK `resolved_at IS NULL` (`supabase/migrations/20260906095225_safety_card_event_resolution.sql:6-7,11-14,20-23`); GM-only SELECT retained (`20260831150000_issue_337_privacy_db_hardening.sql:36-44`); mount/reconnect catch-up head-count of unresolved events, gated on SUBSCRIBED, merged via `Math.max` (`src/features/channels/useSafetyCardEvents.ts:45-65`); dismissal persists by resolving all unresolved rows with fail-safe restore on error (`useSafetyCardEvents.ts:88-112`); banner from persisted state (`src/features/channels/ChannelView.tsx:343-358`). Covered by 13 hook tests incl. live-vs-snapshot races and stale-catchup-after-dismiss (`useSafetyCardEvents.test.tsx:136-291,347-430`). |
| pbp-20260904#P1.2 | Read-mark advances before history loaded; no messages Retry | **[FIXED]** | `useChannel` takes a call-time `canMarkRead` gate, checked at schedule *and* execution time (`src/features/channels/useChannel.ts:18,50,56-57`); gate = `messagesLoadedRef`, opened only by `useMessages`' first successful fetch via `onLoaded` (`ChannelView.tsx:56-69`, `src/features/chat/useMessages.ts:87-90,168-171`), re-closed per channel (`ChannelView.tsx:66-69`); every read path routes through the gate (mount `useChannel.ts:139`, live INSERT `:176-179`, deferred `ChannelView.tsx:128-132`); Retry wired to the shared catch-up (`useMessages.ts:716-723` → `ChannelView.tsx:328-341` banner, `MessageList.tsx:198-216` empty+error Retry). |
| pbp-20260904#P2.1 | Composer resubmit mints fresh `client_request_id` after errored send | **[FIXED]** | Errored bubble with identical full-identity payload is found and its key reused instead of minting (`useMessages.ts:495-503`); the reused slot is replaced, not twinned (`:530-535`); pending guard exempts errored bubbles (`:495`). Tests: `useMessages.test.tsx:526-594` (reuse on same payload, fresh key on different payload). |
| pbp-20260904#P2.2 | No DB `CHECK (char_length(content) <= 4000)` on messages | **[FIXED]** | Legacy oversize rows truncated, then `messages_content_length CHECK ... NOT VALID` added — enforced on all new writes and every subsequent UPDATE (`supabase/migrations/20260906101600_messages_content_length_cap.sql:11-14`). |
| pbp-20260904#P2.3 | Composer Active Player single-select overwrites ensemble turn | **[FIXED]** | The composer's Active Player menu is removed entirely — options now hold only dice/X-Card/upload/scene/NPC/whisper (`src/features/chat/MessageComposer.tsx:299-403`); the payload never sets `active_player_ids` (`:232-241`); `send_message` only touches turn state when the param is non-NULL (`20260831150000:520-537`); the sidebar `ActivePlayerModal` is the single multi-select authority (`ChannelView.tsx:523-529,596-604`). |
| pbp-20260904#P2.4 | Draft-restore race clobbers destination channel draft | **[FIXED]** | Rewrite: the restore effect's cleanup saves `contentRef.current` under the key being left *before* the next key's restore re-stamps the ref (`MessageComposer.tsx:54-80`); live-save effect is keyed on content only so it can't replay pre-restore text into the new key (`:82-90`). |

## P0

None.

## P1

None.

## P2

### 1. Errored dice-roll resubmit mints a fresh `client_request_id` — the roll path never got the message path's fix [NEW]

**Evidence:** `src/features/chat/useMessages.ts:565` (`sendDiceRoll` mints `crypto.randomUUID()` unconditionally); the roll duplicate guard explicitly skips errored bubbles — `if (!m.pending || m.error) return false` (`:572-581`) — and there is no errored-key reuse, unlike the fixed message path (`:498-503`). Retry on the bubble reuses the key (`:675-689`), but the natural re-click paths don't route through it: a `dice:` link (`src/features/chat/MessageItem.tsx:268-274`) and the composer's DiceRoller (`MessageComposer.tsx:302-309`) both call `sendDiceRoll` directly.

**Problem:** A player rolls on a flaky connection; the request times out, the roll bubble shows "Failed," they tap the same dice link again. If the first RPC actually committed (timeout ≠ failure), the table sees the same roll twice with two independent history entries — the exact double-post window #404 closed for messages, still open one door down. Dice are the trust surface of a tabletop app, so a duplicated roll is worse than a duplicated post.

**Fix:** Mirror the message path: inside `sendDiceRoll`, before minting, look for an errored bubble whose roll identity matches (the matcher at `:572-580` already exists — drop only the `m.error` exclusion) and reuse its `client_request_id`; replace the errored slot in place like `:530-535` does. The RPC replay path returns the existing row, so it stays a one-branch change.

**Effort:** Small (one branch + tests mirroring `useMessages.test.tsx:526-594`).

### 2. The 7-day catch-up horizon permanently swallows an X-Card flag for a GM away longer than a week [NEW]

**Evidence:** `src/features/channels/useSafetyCardEvents.ts:7` (`CATCHUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000`) and `:52` (`.gt('created_at', since)` on the unresolved-count query). Unresolved events older than the window are counted by nothing: live INSERTs only fire for new events, and the count query filters them out.

**Problem:** The exact scenario P1.1 existed for — a player flags at 2am, the GM is unreachable — now also has a duration bound. A GM on a two-week break who misses a flag pressed on day 1 comes back to no banner, no count, no trace: the flag is invisible forever. After `20260906095225`, "unresolved" is precisely "unhandled," so age is meaningless for surfacing; the window exists only to avoid surfacing pre-migration rows that client-side dismissals (then local-only) never persisted as resolved. It buys that by silently dropping real late flags.

**Fix:** One migration line backfilling legacy rows (`UPDATE safety_card_events SET resolved_at = now()` — every row existing before the column shipped was already client-dismissed or acted on), then drop the `.gt('created_at', since)` filter so the count is exactly "everything unresolved." No index or schema change needed; the horizon constant goes away.

**Effort:** Trivial (one backfill + delete one filter + adjust two tests).

### 3. X-Card dismissal doesn't propagate across the GM's own tabs/devices [NEW]

**Evidence:** `src/features/channels/useSafetyCardEvents.ts:29-39` — the GM subscription listens to INSERT only; the dismissal UPDATE (`:100-104`) is never received by the GM's other live clients, so their `alertActive`/`alertCount` state isn't re-synced.

**Problem:** GM runs the app on laptop and phone. Dismissing on one leaves the banner showing on the other until the GM dismisses there too (the 0-row UPDATE succeeds silently and clears it, `:95-96,100-111`) or reloads (catch-up recount fixes it). Note the failure direction is safe — staleness can only *show* an alert that no longer exists, never hide a live one — so this is polish for a two-device GM, not a safety hole.

**Fix:** Add an UPDATE handler on the same subscription that recomputes the count with the same head-count query (or decrements when `resolved_at` transitions to non-null). Small; alternatively accept it and document the reload-heals behavior.

**Effort:** Small.

## What's sound — do not touch

- **Safety-card catch-up race handling** (`useSafetyCardEvents.ts:40-65`): snapshot starts only after SUBSCRIBED (a flag landing during setup is caught by the snapshot, not lost), live INSERTs during a pending snapshot can't be erased (`Math.max` merge — count can never move backward), double-counting is impossible by construction (merge is max, not add), `dismissedRef` latches out stale in-flight snapshots after dismissal (`:17,54`), and a failed dismissal write restores the alert *with its tally* (`:105-111`). Tests prove each of these (`useSafetyCardEvents.test.tsx:251-291,347-430`). No false "all clear" path exists: catch-up failure toasts (`:56-57`), live INSERTs keep counting, and reconnection re-runs the catch-up (every SUBSCRIBED re-queries, `:45-46`), self-healing a failed first snapshot.
- **X-Card RLS/authority chain**: players INSERT-only with `resolved_at IS NULL` forced (`20260906095225:20-23` — a flagger can't pre-resolve their own flag into invisibility), GM-only UPDATE (`:11-14`), GM-only SELECT (`20260831150000:36-44`), table in the realtime publication with REPLICA IDENTITY FULL (`20260811120000_afk_and_safety_tools.sql:60-62`). WALRUS keeps players' sockets silent; the hook doesn't even open a socket for non-GMs (`useSafetyCardEvents.ts:23`).
- **`subscribeWithRetry`** (`src/lib/realtime.ts:61-112`): unchanged — backoff 1s→30s, retryable-status set, single aggregated status via `useSyncExternalStore`, clean teardown. All subscriptions route through it.
- **Message reconnect catch-up** (`useMessages.ts:205-311,387-410`): paginated forward INSERT catch-up (100-page guard), composite `(updated_at, id)` UPDATE reconcile applied only to held ids, cursor snapshotted before catch-up advances it, reactions refetched in the same shared path — now also powering Retry and visibility return. Backed by the new `(channel_id, updated_at, id)` index (`20260905175441_add_messages_channel_updated_at_index.sql:6`).
- **Idempotent message sending**: optimistic echo reconciled by id/`client_request_id` (`useMessages.ts:332-356`), pending-duplicate suppression (`:483-496`), errored-key reuse on resubmit (`:498-503`), bubble Retry/Remove with full context preserved (`MessageItem.tsx:473-481`), "no error but no id" surfaces a retryable state (`:554-558`), RPC-side replay on `unique_violation` (`20260831150000:551-567`).
- **Read-state design**: once-per-mount boundary capture (`useChannel.ts:114-117`), serialized monotonic `last_read_at` writes with member-id re-validation at execution time (`:40-66`), visibility-gated live advance (`:176-179`), divider derived from the frozen boundary (`MessageList.tsx:248-250`), and the history-first gate covering every write path. The "where was I?" boundary now survives a failed first fetch, a retry, and a channel switch.
- **Server-authoritative dice**: unchanged — notation regex gate, 100-dice/1000-sides caps, DC bounds, server-built content, atomic message+roll insert, replay on same key (`20260831150000:166-174,183-395` region); client `dice:` click-site validation kills the misleading "Rolling" bubble (`MessageItem.tsx:268-274`); `urlTransform` sanitization intact (`:68-84`).
- **Message-type authority**: DB-enforced — member INSERT policy allows only `regular/scene/npc` with scene/npc GM-gated (`20260817144037_backend_command_schema.sql:51-52`), `system`/`dice_roll` originate exclusively from server paths, and the RPC re-enforces the same gates (`20260831150000:465-468`). chat-ux#1.4 stays closed.
- **Turn-state integrity**: composer messages can no longer touch `is_active_player` (chip removed + RPC NULL-guard, see disposition P2.3); the modal path validates membership/suspension server-side (`20260831150000:520-537`).
- **Scroll anchoring & continuity**: prepend offset preservation, ResizeObserver bottom-pin, visibility restore without yank (`MessageList.tsx:94-196`), initial load anchors to the unread divider or bottom (`:79-90,112-113`), auto-load-older at top (`:129-139`), `role="log"`/`aria-live` on the stream (`:224-225`).
- **Cross-channel stale-state guards** (no regression): messages/reactions/error/boundary cleared synchronously on channel change (`useMessages.ts:122-136`, `useChannel.ts:70-87`), gate re-closed per channel (`ChannelView.tsx:66-69`).
- **Offline/deep-link**: SW `NavigationRoute(createHandlerBoundToURL('index.html'))` serves the shell to offline deep links (`src/sw.ts:20-23`); offline banner states are honest and role="status" (`src/components/RealtimeBanner.tsx:8-15`); tray notifications close on read (`sw.ts:115-137`).
- **Lobby unread liveness**: messages-INSERT subscription filtered to own channels + push relay + visibility + throttled realtime-status refetch (`useChannels.ts:105-141`).
- **Boundary validation**: Zod at every realtime/PostgREST row boundary; `normalizeMessage` rewrites embed keys only when present, so UPDATE merges can't blank sender/whisper/reply embeds (`src/features/chat/validation.ts:67-83`).
- **AFK handling**: `is_away`/`away_message` surfaced in roster and status bar with graying/strikethrough (`MemberList.tsx:145-191`, `ChannelStatusBar.tsx:71-74`); server-side turn-push suppression for away members verified in phase 4 and unchanged.
- **Drafts**: per-channel restore/save with the race fixed, `maxLength` on the textarea, clear-on-success only (`MessageComposer.tsx:45-90,244-245,642`).

## Intentional exclusions

Carried from `audit_pbp_chat_ux.md` / `20260904` (do not fix):

1. **Free-form initiative** — `status_text` markdown + manual turn advancement, no structured order.
2. **Hidden/GM rolls do not exist** — all dice are public by design.
3. **External character sheets** — links + per-system attribute modifiers only; no HP/AC tracking.
4. **No threads / sub-channels / OOC-IC structure** — one timeline per channel; whispers are the only private path.
5. **No spoiler syntax or statblock rendering** — Markdown + GFM only.
6. **Email notifications are future** — `email_enabled` is schema/UI only.
7. **No typing/presence indicators** — connection state is covered by the RealtimeBanner.
8. **Soft-delete-only messages** — hard DELETEs can't be reconciled by refetch; every delete path is a soft delete, which is what keeps UPDATE reconcile sufficient (`useMessages.ts:255-256`).
9. **`system` / `dice_roll` types are command-only** — server paths only, DB-enforced.
10. **Offline = cached shell + honest error states, no runtime message cache.**
11. **One `last_read_at` write per arriving message while visible** — debounce deferred (`useChannel.ts:170-171`).
12. **`created_at` cursor in catch-up** — microsecond precision makes boundary straddling theoretical; id-based cursor is the documented upgrade path (`useMessages.ts:212-214`).
13. **Sidebar-only table tools (issue #382)** — no header icon row.
14. **No in-flight guard on messages `refresh()`** — concurrent catch-ups dedupe by id and are guard-bounded; double-click just fetches twice (`useMessages.ts:714-715`).

New deliberate choices observed this pass (do not fix):

- **Resolution is per-event, not a per-GM dismissal ledger** — `resolved_at` on the event row is sufficient for single-GM channels (`gm_id` is a single column); a dismissal-ledger table would be architecture for a constraint that doesn't exist.
- **Explicit table DML grants to match hosted Supabase** (`20260905195245_add_table_dml_grants.sql`) — RLS remains the access authority; the migration only makes local/CI reset behave like hosted under CLI v2.111.0.
- **X-Card catch-up failure surfaces a toast, not a retry** — self-heals on the next reconnect (every SUBSCRIBED re-queries) and live INSERTs are unaffected; a dedicated retry affordance would be chrome.
- **Catch-up horizon of 7 days** — deliberate ceiling documented in-code (`useSafetyCardEvents.ts:6-7`); its safety-tool implication is raised as P2 #2 above rather than re-litigated as intent.

## Suggested execution order

1. **Drop the 7-day X-Card horizon** (P2 #2) — one backfill + delete one filter; it's the only remaining way the safety tool can silently fail, and the fix is smaller than the code it removes.
2. **Errored-key reuse in `sendDiceRoll`** (P2 #1) — one branch mirroring the just-shipped message-path fix, before a real table hits the double-roll window.
3. **X-Card UPDATE propagation across GM devices** (P2 #3) — optional polish; if skipped, document the reload-heals behavior next to the catch-up comment.

All three are small, test-covered-able, and touch no architecture or dependencies. The load-bearing path — subscriptions, catch-up, idempotent sends, read-mark gating, RLS — needs nothing.
