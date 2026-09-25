# PbP Game & Realtime UX Audit — 2026-09-25 (final pre-release)

## Audit Prompt

> You are a realtime/multiplayer systems engineer writing ONE audit report for a pre-public-release FINAL audit of a multiplayer play-by-post TTRPG web app (React 19 + Supabase Realtime + Postgres). This is a READ-ONLY research + report task: do NOT modify code, do NOT run `gh`, tests, builds, or `supabase` (the orchestrator already ran the suite). Your only output file is `docs/audit/20260925/audit_pbp_realtime.md`. Every finding MUST cite verified `file:line`; no evidence = no finding. Do not trust commit messages — read the current source and migrations. Re-verify the two 20260920 P2 findings (reaction initial fetch full-replace drop; reaction toggle non-optimistic + unguarded), then audit the deltas since 2026-09-20 (dice favorites #586/#589, PWA reload self-heal #601 + update banner #576, status-bar chevron #577, image upload/error UX #592/#593, admin DM light mode #590, system-alert thread `20260921171132`), and the core PbP realtime surfaces end to end: message send/optimistic/errored-bubble retry and `client_request_id` reuse, reconnect + `visibilitychange` reconcile, pagination/cursor and scroll anchoring, edits/deletes catch-up, whisper visibility, X-Card lifecycle across devices, unread counts/badge, composer drafts and channel switching, realtime subscription churn, GM active-player/turn-setting, and the dice-favorites path. Focus on races, lost updates, double-posts, missed events while backgrounded, and anything that breaks asynchronous play. Tag every finding [NEW]/[OPEN]/[INTENTIONAL]. Severity: P0 = launch blocker / message loss / data corruption · P1 = significant async-play gap · P2 = polish. Mirror the structure of `docs/audit/20260920/audit_pbp_realtime.md`.

## Scope & Verification

**Date:** 2026-09-25

**Scope (files reviewed):** prior-finding re-verification: `src/features/chat/useMessages.ts`, `src/features/channels/ChannelView.tsx`. Core surfaces: `src/features/chat/MessageList.tsx`, `MessageComposer.tsx`, `MessageItem.tsx`, `validation.ts`, `src/features/channels/useChannel.ts`, `useSafetyCardEvents.ts`, `useChannels.ts`, `ChannelStatusBar.tsx`, `ActivePlayerModal.tsx`, `useActivePlayers.ts`, `src/lib/realtime.ts`, `channelRead.ts`, `src/hooks/useAppBadgeSync.ts`, `src/features/dice/DiceRoller.tsx`, `useDiceFavorites.ts`, `useRecentRolls.ts`. Deltas: `src/lib/pwaUpdate.ts`, `hardReload.ts`, `src/hooks/useImageUpload.ts`, `src/features/admin-messages/ThreadDetail.tsx`, `ThreadList.tsx`, `useAdminThreads.ts`, `useAdminMessages.ts`, `useAdminUnread.ts`. Migrations: `20260817144037`, `20260817144039`, `20260817144038`, `20260831140000`, `20260831150000`, `20260907133713`, `20260921171131`, `20260921171132`, `20260921190433`, `20260923164100`, `20260924164257`.

**Verification run this pass:**

- Read-only source, migration, and test inspection only. No `gh`, no tests, no builds, no database (audit contract; the orchestrator ran the full suite and reported vitest 1955 passed, pgTAP 411 passed, E2E 7 passed).
- Every finding below cross-checked against a second, independent code path that already solves the same problem (the codebase's own regression-test bar), or against the server-side authority in the migrations.
- Prior finding #8 and #9 re-verified against the exact current lines, not the commit that claims to fix them.

## Executive Summary

| Vector | 2026-09-20 | 2026-09-25 | Notes |
|---|---|---|---|
| Realtime delivery & idempotency | 9.5/10 | 9.5/10 | Server-authoritative `client_request_id` replay on both send and roll, pending/errored-key reuse, reactions idempotent by construction. No P0/P1. |
| Reconnect / catch-up reconcile | 9/10 | 8.5/10 | The INSERT catch-up, the UPDATE reconcile, and the realtime handler each dedupe differently: the realtime handler and the UPDATE reconcile both key on `client_request_id`, but the INSERT catch-up keys only on row id, so one recovery path can twin a committed-but-unconfirmed send. The catch-up cursor is also derived from a locally-stamped optimistic row. |
| Async-play state isolation | 9.5/10 | 9.5/10 | Composer drafts are re-stamped per channel; `useMessages`/`useChannel` reset on channel change; navigation between channels passes through the Lobby (remount), so ChannelView-level state does not leak. |
| Safety-tool (X-Card) | 9.5/10 | 9.5/10 | Catch-up + persisted `resolved_at` + cross-device UPDATE recount + identity-free resolution message are intact. One recount path (Retry) drops the zero-count clear its two siblings apply. |

**Biggest strength — the two 20260920 P2s are genuinely fixed, and the fixes hold the codebase's own regression bar.** `fetchReactions` now merges through `upsertReaction` instead of replacing (`useMessages.ts:220-226`), and the toggle is optimistic with a per-`messageId:emoji` in-flight guard and a functional rollback against current state (`useMessages.ts:796-818`), with `ChannelView` routing through it (`ChannelView.tsx:212-219`). The dice-favorites path added since (#586/#589) is built to the same bar: optimistic per-notation toggles, in-flight fetch reconcile with a delta log, owner-scope guarding, and a DB trigger as the race-proof cap (`useDiceFavorites.ts:34-134`, `20260923164100:37-55`).

**Biggest weakness — the reconnect INSERT catch-up is the one recovery path that does not share the dedupe/cursor rules the other two paths use.** `catchUp` merges server rows only by `id` (`useMessages.ts:267-274`), while the live INSERT handler (`:375-388`) and the UPDATE reconcile (`:327-331`) both also collapse a pending bubble by `client_request_id`. A send that committed server-side but whose confirmation and realtime echo were both lost therefore reappears as a second bubble on the next `visibilitychange`/reconnect. Separately, the same function derives its cursor from the newest held row including client-stamped optimistic rows (`:239-248`), so a forward-skewed device clock can skip messages in the catch-up window. Neither loses server data; both are replay-recovery correctness gaps on the path a flaky connection depends on.

## Prior findings disposition

| Prior ID | Finding (20260920) | Status | Evidence (current state) |
|---|---|---|---|
| pbp-20260920 P2 #1 | Reaction initial fetch does a full replace and can drop a live-arrived reaction | **[FIXED]** | `fetchReactions` now folds the snapshot into prior state through the same idempotent helper the realtime handler uses: `setReactions(prev => rows.reduce((acc, row) => upsertReaction(acc, row, uid), prev))` (`src/features/chat/useMessages.ts:220-226`). The realtime INSERT path still upserts into `prev` (`:410-413`), so a row that lands mid-fetch survives. |
| pbp-20260920 P2 #2 | Reaction toggle is non-optimistic and un-guarded against rapid re-click | **[FIXED]** | `toggleReaction` flips the local summary immediately, guards re-taps with a `reactionPendingRef` keyed `${messageId}:${emoji}`, and rolls back functionally on error (`src/features/chat/useMessages.ts:796-818`; ref at `:111`). `ChannelView` no longer calls the bare `addReaction`/`removeReaction` — it awaits `toggleReaction` and only toasts on a real write failure (`src/features/channels/ChannelView.tsx:212-219`). |
| pbp-20260907 P1-2 | X-Card resolution silent for players | **[FIXED — regression-checked]** | `resolve_safety_card_events` still resolves all unresolved events and posts one identity-free `system` message in the same transaction, only when a row was actually resolved (`supabase/migrations/20260907133713_xcard_resolution_system_message.sql:37-51`); the client routes the dismiss through it (`src/features/channels/useSafetyCardEvents.ts:204`). |

## P0

None. No launch blocker, message loss, or data-corruption path found in this pillar.

## P1

None. Every race found this pass degrades to a transient, self-recoverable display state; none loses a server row or blocks asynchronous play.

## P2

Ordered by return-on-effort.

### 1. Reconnect INSERT catch-up can twin a committed-but-unconfirmed send (no `client_request_id` dedupe) — [NEW]

**Evidence:**

- `catchUp` merges fetched batches by row id only: `const existing = new Set(prev.map(m => m.id)); const merged = [...prev, ...batch.filter(m => !existing.has(m.id))]` (`src/features/chat/useMessages.ts:267-274`).
- Both sibling recovery paths collapse the optimistic bubble by `client_request_id`:
  - live INSERT: `prev.filter(m => m.id !== newMsg.id && (newMsg.client_request_id ? m.client_request_id !== newMsg.client_request_id : true))` (`useMessages.ts:375-388`);
  - UPDATE reconcile: `!(m.pending && m.client_request_id && batchRequestIds.has(m.client_request_id))` (`useMessages.ts:327-331`).
- An errored send keeps `pending: true` and its `client_request_id`; a retry replays on that same key (`useMessages.ts:597-598`, `:644-645`; DB partial unique index `messages (channel_id, sender_id, client_request_id)` at `supabase/migrations/20260817144037_backend_command_schema.sql:23`).
- `applyRpcResult` maps **every** row whose `client_request_id` matches to the confirmed id: `prev.map(m => m.client_request_id === clientRequestId ? { ...m, id: messageId, pending: false, error: null } : m)` (`useMessages.ts:558-564`).

**Problem:** When the send RPC times out *after* the server committed but the realtime echo was also dropped (flaky socket), the errored bubble stays in state. On the next `visibilitychange`/reconnect, `catchUp` fetches the committed server row and appends it because its id is not held — now two bubbles for one message. If the user then taps Retry, `applyRpcResult` rewrites the id on both, producing two entries with the same `id` (a duplicate React key) for the same message. The server is never wrong (the RPC replays to the same row); the client displays one message twice and can only clean it up by removing the errored bubble.

**Fix:** Add the `client_request_id` collapse to `catchUp`'s merge, mirroring the live handler: when a fetched row carries a `client_request_id`, drop any held row matching it before appending (and cap the merge by id as today). Add a regression test that sends, fails the RPC after the server row is committed, drops and re-subscribes the socket with the row in the catch-up page, and asserts exactly one row remains.

**Effort:** Small (~one line + test mirroring the existing merge test).

### 2. Catch-up cursor is derived from a client-stamped optimistic row, so a skewed clock can skip messages — [NEW]

**Evidence:**

- `catchUp` picks the newest **held** row with no pending/server filter and uses its `created_at` as the cursor: `const newest = held.reduce(...)` / `let cursor = newest.created_at` / `.gt('created_at', cursor)` (`src/features/chat/useMessages.ts:239-248`, `:255`).
- Optimistic messages are stamped from the **client** clock: `created_at: new Date().toISOString()` (`useMessages.ts:612`, `:699`), and `applyRpcResult` does **not** re-stamp `created_at` from the server when the send is confirmed — it only sets `id`/`pending`/`error` (`useMessages.ts:558-564`).
- The realtime INSERT echo does replace the row with its server `created_at` when it arrives (`useMessages.ts:367-379`), so the poisoned cursor exists only when the echo was missed.
- The code already knows the pattern is unsafe in the other direction: `jumpToMessage` explicitly skips pending rows so a skewed-early optimistic stamp cannot become the cursor (`useMessages.ts:501-508`).

**Problem:** On reconnect or foreground return, if the newest held row is a locally-confirmed message (echo missed, socket was down), its `created_at` is the device clock, not the DB clock. `.gt('created_at', cursor)` then excludes any missed message whose server `created_at` is at or below that local stamp — i.e. everything that committed in the window between (device stamp − clock offset − network latency) and the device stamp. With a typical NTP-synced clock that window is the send latency (tens to hundreds of ms); on a device whose clock runs ahead it widens to the offset. Those messages stay missing for the session because `reconcileUpdates` only reapplies held rows, not inserts, and the poisoned cursor is reused by every later catch-up until the channel is re-entered.

**Fix:** Track a separate insert cursor fed only by server-fetched rows (a `serverCreatedAtRef` advanced in `fetchMessages`, each `catchUp` batch, the realtime INSERT echo, and `reconcileUpdates`), and use it — not the newest held row — as the catch-up cursor; fall back to `fetchMessages()` when no server-stamped row is held. Alternatively re-stamp `created_at`/`updated_at` from the server when a send is confirmed. Add a test that seeds a locally-stamped newest row, a server row inside the skew window, and asserts the catch-up still returns it.

**Effort:** Small-to-medium (one ref threaded through the fetch paths + tests).

### 3. X-Card Retry recount drops the zero-count clear its two sibling paths apply — [NEW]

**Evidence:**

- `retryCatchUp` only acts on a positive count; a successful zero leaves the existing banner untouched: `setCatchUpError(false); if (count && count > 0) { setAlertActive(true); setAlertCount(prev => Math.max(prev, count)) }` — no `else` (`src/features/channels/useSafetyCardEvents.ts:145-168`).
- The mount snapshot clears on zero: `else { setAlertActive(false); setAlertCount(0) }` (`useSafetyCardEvents.ts:115-126`).
- The cross-device UPDATE handler clears on zero: `else { setAlertActive(false); setAlertCount(0) }` (`useSafetyCardEvents.ts:80-86`).
- The retry's own comment claims parity: "re-runs the same head-count with the same merge semantics (generation check, `Math.max`)" (`useSafetyCardEvents.ts:137-139`).
- The Retry control is reachable while the banner is up: the reconnect snapshot sets `catchUpError` on failure without clearing `alertActive` (`:108-112`), and `ChannelView` renders Retry while `catchUpError` is true (`ChannelView.tsx:403-415`).

**Problem:** A GM whose banner is up, whose socket drops, and whose reconnect snapshot query fails gets a Retry button. If the Retry then succeeds and finds zero unresolved events (the flags were resolved on another device while the socket was down), the banner stays on with the stale count — a false "X-Card triggered" alarm that persists until the next live event or reconnect. It fails safe (a false alarm, not a false all-clear) but contradicts the documented parity and is untested for the zero case.

**Fix:** Mirror the mount/UPDATE branches in `retryCatchUp`: add the `else { setAlertActive(false); setAlertCount(0) }` on a successful zero count. Extend the retry test to assert the banner clears when the retry finds zero.

**Effort:** Small (~two lines + one test).

### 4. `retryMessage` has no no-id guard, so a data-less RPC success strands the bubble pending — [NEW]

**Evidence:**

- `retryMessage` clears the error first (spinner state), then in both branches only handles `error` and otherwise calls `applyRpcResult` unconditionally: `src/features/chat/useMessages.ts:824-865` (`:841-845` roll, `:859-863` message).
- `applyRpcResult` is a no-op when there is no `message_id` (`useMessages.ts:558-564`).
- Both original send paths explicitly handle the "no error but no returned id" case by flagging the bubble: `sendMessage` at `useMessages.ts:649-653` and `sendDiceRoll` at `:733-735` (`'Message was not confirmed…'` / `'Roll was not confirmed…'`).
- The pending spinner and the Retry/Remove affordances are mutually exclusive: `pendingOverlay` renders while `pending && !error` (`src/features/chat/MessageItem.tsx:598-602`); `errorOverlay` — the only place Retry and Remove live — renders only when `message.error` (`MessageItem.tsx:604-612`).

**Problem:** If a retried `send_message`/`roll_dice` call resolves with no error and no row (the defensive case the send path already anticipates), `retryMessage` clears `error`, `applyRpcResult` no-ops, and the bubble is left `pending: true, error: null` — a permanent spinner with no Retry and no Remove. The user cannot recover the bubble in place. Reachability is low (the RPC returns a row in every success branch), but this is the exact guard the send path carries, and the retry path silently omits it.

**Fix:** Mirror the send paths: in `retryMessage`'s `else` branches, when `applyRpcResult` finds no id, set the same "not confirmed" error on the bubble. Add a test that resolves the retried RPC with `{ data: [], error: null }` and asserts the bubble shows the error (not a spinner).

**Effort:** Small (~four lines + one test).

## What's sound — do not touch

- **Message send idempotency & optimistic echo** — pending-duplicate suppression and errored-key reuse share one full-identity bar; the same `client_request_id` is replayed to the same server row (`useMessages.ts:578-598`, `:664-684`), backed by the partial unique index (`20260817144037:23`) and the RPC replay/`unique_violation` handling (`20260831150000:435-446`, `:551-567`).
- **Reconnect + visibility reconcile** — one shared `catchUpRef` for reconnect, `visibilitychange`, and the Retry button, running INSERT catch-up + edit/delete reconcile + reaction refetch (`useMessages.ts:440-448`); `reconcileUpdates` uses a composite `(updated_at, id)` cursor so a full page sharing one timestamp cannot skip rows (`:290-344`).
- **Pagination & scroll anchoring** — height-delta prepend anchoring, divider re-center while anchored, `boundaryRevision`-driven foreground re-anchor, and `userTookOver`/gesture refs so a real reader is never yanked; visibility restore guards against a dropped scroll position (`MessageList.tsx:142-154`, `:180-187`, `:340-408`); `loadOlder`/`jumpToMessage` use the same composite cursor (`useMessages.ts:459-488`, `:498-550`).
- **Edits/deletes** — optimistic apply with per-message mutation tokens so a failed mutation rolls back only if no newer mutation took over (`useMessages.ts:122-132`, `:738-773`); the UPDATE echo reapplies the server row idempotently; soft-delete keeps UPDATE-reconcile sufficient.
- **Whisper visibility** — realtime respects the SELECT policy, and the composer/server both validate the target as a non-blocked member of the same channel (`20260831150000:489-496`); the client labels the recipient only from the joined profile (`MessageItem.tsx:806-810`).
- **X-Card lifecycle** — catch-up has no age horizon plus persisted `resolved_at`, the GM-only RLS and the cross-device UPDATE recount are generation-guarded, and resolution posts one identity-free `system` message through the normal pipeline (`useSafetyCardEvents.ts:36-135`, `:184-211`; `20260907133713:37-51`).
- **Unread counts / badge** — history-first read gate, serialized server-owned `mark_channel_read`, and generation-guarded badge refresh (`useChannel.ts:59-81`, `:188-196`; `channelRead.ts:17-33`; `useAppBadgeSync.ts:23-63`).
- **Composer drafts & channel switching** — the restore effect's cleanup saves under the key being left before the new key's restore, and live-save is keyed on content only, so a quick switch cannot write the old channel's text over the new draft (`MessageComposer.tsx:52-97`); channel switching routes through the Lobby, which remounts `ChannelView`, so no ChannelView-level state leaks.
- **Realtime subscription churn** — module-singleton status store and a resubscribe-with-backoff wrapper that refetches on recovery (`src/lib/realtime.ts:65-113`); `useChannels` throttles a burst into one refetch (`useChannels.ts:113-138`).
- **GM active-player / turn-setting** — `channel_members` `'*'` events merge into the roster so active-player and status changes propagate live (`useChannel.ts:198-218`); `set_active_players` re-validates GM-only + membership + not-blocked server-side; the composer cannot touch turn state.
- **Dice favorites path (#586/#589)** — personal own-row RLS, optimistic per-notation toggle with rollback and a pending set, in-flight fetch reconcile with a scope guard, and a DB trigger as the race-proof cap (`useDiceFavorites.ts:34-134`; `20260923164100:21-55`).
- **System-alert thread (`20260921171132`)** — a single admin-only system thread authored only by `SECURITY DEFINER` functions, with Markdown-escaped user labels and best-effort delivery so an alert failure cannot roll back the abuse report (`20260921171132:26-82`, `:164-234`; `20260921190433:19-75`); it reuses the existing admin-message realtime, read-marker, and unread counter (`useAdminThreads.ts:218-257`, `useAdminMessages.ts:85-116`, `useAdminUnread.ts:11-73`).
- **PWA update / reload handshake (#576/#601)** — the boot handshake detects a re-served stale shell and self-heals, and the reload waits on the worker lifecycle with a bounded self-heal fallback (`pwaUpdate.ts:59-119`, `:168-219`); `hardReload` covers WebKit/PWA containers (`hardReload.ts:12-33`).

## Intentional exclusions

Carried from prior rounds (do not fix): free-form initiative; public-only dice (no hidden/GM rolls); external character sheets; single timeline, no threads/OOC split; no spoiler/statblock rendering; email deferred; no presence indicators; soft-delete-only messages; command-only `system`/`dice_roll` types; offline = cached shell + honest errors; one `last_read_at` write per arriving message (`useChannel.ts:188-189`); `created_at` catch-up cursor; per-event resolution (not a per-GM dismissal ledger).

New deliberate choices observed this pass (do not fix):

- **The reaction merge intentionally never prunes rows deleted while the socket was down** — the fix for 20260920 P2 #1 merges the fetch into prior state and documents that realtime DELETE covers the connected case while a remount covers the rest, with pruning against the fetched row set named as the upgrade path (`useMessages.ts:222-224`). Accepted because reactions are additive, non-critical metadata and a stale chip self-heals on the user's next tap or a channel re-entry.
- **The INSERT catch-up cursor deliberately has no `id` tie-breaker** — `created_at` microsecond precision is treated as sufficient to avoid a page-boundary straddle (`useMessages.ts:245-247`); an `id`-based cursor is the documented upgrade path.
- **Reactions on whispered messages still carry SELECT-able row metadata** — the reactions SELECT policy remains `is_channel_member`, unfiltered by whisper visibility (rendered only alongside the whisper, so no visible leak). Carried from 20260920; flag for the security pillar if it is re-audited.
- **Roster "Set as Active Player" remains a single-select overwrite shortcut** — the multi-select/clear authority is the sidebar modal; the menu label is singular and explicit (`MemberList.tsx` `handleSetActivePlayer`). Carried from 20260920.

## Suggested execution order

1. **P2 #1** — add the `client_request_id` collapse to `catchUp`'s merge, matching `reconcileUpdates` and the live INSERT handler. One line + a regression test; closes the only double-render path.
2. **P2 #3** — add the zero-count clear to `retryCatchUp`. Two lines + a test; removes a stale false X-Card alarm.
3. **P2 #4** — add the no-id guard to `retryMessage`, mirroring `sendMessage`/`sendDiceRoll`. Four lines + a test; removes a permanent-stuck spinner edge.
4. **P2 #2** — thread a server-stamped insert cursor through the fetch paths (or re-stamp the confirmed row) and test the skew window. Slightly larger, but it is the only path that can miss messages on reconnect.

All four are small, test-covered, and touch no architecture, schema, or dependencies. The load-bearing path — subscriptions, idempotent sends and rolls, edit/delete reconcile, read-mark gating, unread counting, X-Card lifecycle, turn-state RLS, composer drafts, and the new dice-favorites and system-alert surfaces — needs nothing.
