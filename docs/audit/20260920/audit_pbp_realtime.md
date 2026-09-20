# PbP Game & Realtime UX Audit — 2026-09-20

## Audit Prompt

> *Re-audit the realtime/gameplay UX of a multiplayer play-by-post TTRPG web app (React 19 + Supabase Realtime + Postgres). READ-ONLY: no code changes, no `gh`, no tests/builds/DB. Re-verify the three 20260907 pbp P2 findings against current code, then audit the new realtime/gameplay surface merged since 2026-09-07 (~30 PRs): reactions on dice-roll messages (#529), immediate message edits (#448), unread-count accuracy (whisper/blocked/suspended/archived), lobby previews, image viewer/drag-drop, push notification copy, roster active-player + admin read-only views, and the X-Card lifecycle. Focus on realtime message/dice/reaction delivery correctness, idempotency/replay, optimistic-update rollback, unread accuracy, lobby preview freshness, scroll anchoring under prepends, X-Card lifecycle, and active-player turn state.*

**Date:** 2026-09-20
**Scope:** PbP game & realtime UX pillar — re-verification of the three 20260907 pbp findings (#1–#3), plus the ~30-PR surface merged since (reactions #529, immediate edits #448, unread accuracy #437/#441/#517, lobby previews #497/#498, image viewer #513/#499, push copy #537, roster active-player #555, admin read-only #557, X-Card resolution #444/#434).
**Baseline docs:** `docs/audit/20260907/audit_pbp_realtime.md` + `INDEX.md`, `docs/audit/20260904/audit_pbp_realtime.md`.

**Verification commands run:**

- `npx tsc -p tsconfig.app.json --noEmit` — **passed** (no errors)
- `npx oxlint` — **passed** (exit 0, 46 warnings — all pre-existing `react(set-state-in-effect)`/`react(refs)`/`jsx-a11y` classes, none in the audited paths are correctness defects)
- Read-only file inspection (grep/read) of `src/` and `supabase/migrations/` + `supabase/functions/` — no code modified, no `gh`/git write, no tests/builds/DB run.
- Tests/coverage/build by orchestrator: **1770 passed**, coverage 92.82 / 84.83 / 90.4 / 95.65.

## Executive Summary

The realtime wall is intact, and every 20260907 pbp finding is now verifiably fixed in code — including the two items the prior round flagged as the last remaining safety-tool gaps. The dice-roll path got the errored-key reuse the message path already had (`useMessages.ts:670-678`); the 7-day X-Card horizon is gone, replaced by a correctly-scoped backfill (`20260907131618`) plus an unbounded unresolved-count query (`useSafetyCardEvents.ts:104-105`); and GM cross-device dismissal now propagates through an UPDATE handler that re-counts unresolved events (`useSafetyCardEvents.ts:56-88`). The P1-2 "player closure" gap also landed: `resolve_safety_card_events` (`20260907133713`) resolves the flag *and* posts an identity-free system message through the normal message pipeline in one transaction.

The new surface is clean on the load-bearing paths. Reactions are server-authoritative (DB `UNIQUE (message_id, user_id, emoji)`, `REPLICA IDENTITY FULL` for DELETE echoes), dice-roll messages restrict their action row to reactions-only, immediate edits carry mutation-token rollback, and unread counts now correctly exclude whispers/blocked/suspended/archived through one shared function. Two small P2s remain, both in the reactions UI — a fetch-vs-live race that can drop a just-arrived reaction, and a non-optimistic toggle with no double-click guard. Neither blocks; neither risks data loss.

## Prior findings disposition

| ID | Finding (20260907) | Status | Evidence (current state) |
|---|---|---|---|
| pbp-20260907#1 | Errored dice-roll resubmit mints a fresh `client_request_id` | **[FIXED]** | `sendDiceRoll` now finds an errored bubble by full roll identity (`sameRollPayload` + `Boolean(m.error)`) and reuses its key: `src/features/chat/useMessages.ts:670-678`; the reused slot is replaced in place, not twinned (`:706-711`). The RPC replay path (`roll_dice` on `p_client_request_id`) returns the existing row, so the late-landing first attempt can no longer double-roll. |
| pbp-20260907#2 | 7-day X-Card catch-up horizon swallows flags for a GM away > 1 week | **[FIXED]** | `CATCHUP_WINDOW_MS` is gone; the unresolved count queries have no age filter — `.eq('channel_id', …).is('resolved_at', null)` (`src/features/channels/useSafetyCardEvents.ts:69-73,101-105,149-153`). The legacy pre-`resolved_at` rows were backfilled resolved with the exact evidence-based cutoff the prior report demanded (only `created_at < '2026-09-06 09:52:25+00'`): `supabase/migrations/20260907131618_xcard_backfill_pre_resolution_rows.sql:10-13`. |
| pbp-20260907#3 | X-Card dismissal doesn't propagate across the GM's own tabs/devices | **[FIXED]** | A `postgres_changes` UPDATE handler on the same subscription re-counts unresolved events on every `resolved_at` transition and clears/keeps the banner accordingly (`useSafetyCardEvents.ts:56-88`); the dismiss RPC's own UPDATE echo reaches every GM client. The recount is generation-guarded so a stale in-flight SELECT can't resurrect a cleared banner. |

The P1-2 "resolution is silent for players" gap (INDEX 20260907) also landed: `resolve_safety_card_events` resolves all unresolved events *and* inserts a channel-level identity-free `system` message in one `SECURITY DEFINER` transaction, and only announces when something was actually resolved (`supabase/migrations/20260907133713_xcard_resolution_system_message.sql:12-52`); the client dismiss path routes through it (`useSafetyCardEvents.ts:204`).

## P0

None.

## P1

None.

## P2

### 1. Reaction initial fetch does a full replace and can drop a live-arrived reaction [NEW]

**Evidence:** `fetchReactions` ends with `setReactions(buildReactionMap(rows, user?.id))` — a complete replacement, no merge against `prev` (`src/features/chat/useMessages.ts:208-221`). It is fired fire-and-forget at effect start (`:341`) *before* the realtime subscription is stood up (`:344`), whose INSERT handler upserts into `prev` (`:404-407`). The message fetch, by contrast, explicitly merges and keeps live rows not in the fetched set: `setMessages(prev => { const fetchedIds = …; const merged = [...prev.filter(m => !fetchedIds.has(m.id)), ...fetched] })` (`:181-188`).

**Problem:** On mount (or channel switch), if another player's reaction INSERT commits after `fetchReactions`' SELECT snapshots but before its response is applied, the live INSERT handler has already added the reaction to state — then `fetchReactions` resolves and overwrites it back out. The reaction vanishes until the next reconnect/visibility catch-up re-runs `fetchReactions` (which now includes it). The exact race the message path treats as a correctness requirement is left open one door down. Reactions are new (#529) and non-critical, so this is polish, not data loss — but it is a visible "my reaction just disappeared" flicker on a busy channel.

**Fix:** Mirror the message merge: in `fetchReactions`, merge fetched rows with `prev` instead of replacing — either `setReactions(prev => ({ ...prev, ...buildReactionMap(rows, user?.id) }))` (reactions are additive-only; DELETE reconcile is already handled by the realtime handler) or, if a full replace is wanted for deleted-row hygiene, key the merge on the high-water `created_at` of reaction rows seen. Smallest correct form is the shallow merge, since `dropReaction` on the live path already removes stale rows.

**Effort:** Small (one line + a test mirroring the message-merge test).

### 2. Reaction toggle is non-optimistic and un-guarded against rapid re-click [NEW]

**Evidence:** `handleToggleReaction` reads `reactionsRef.current` to decide add-vs-remove, then awaits the write (`src/features/channels/ChannelView.tsx:213-225`); `addReaction`/`removeReaction` are bare `insert`/`delete` with no optimistic state and no pending/duplicate guard (`src/features/chat/useMessages.ts:769-784`). A rapid second click reads stale `hasReacted=false` (state hasn't updated — there is no optimistic echo) and re-INSERTs, hitting the DB `UNIQUE (message_id, user_id, emoji)` constraint (`supabase/migrations/20260806120000_add_replies_reactions.sql:17`) and surfacing a spurious "Failed to update reaction." toast. No duplicate row is possible (constraint holds), but on a dead realtime socket (backgrounded tab) a committed reaction shows zero feedback until the next visibility catch-up.

**Problem:** Unlike messages and rolls — which carry pending/errored guards and optimistic echo — reactions give no immediate visual state and no idempotency guard. On a flaky connection the user gets either a delayed chip or a false error toast for a double-click. The dice/message paths set the bar for this exact surface; the newest interactive surface doesn't meet it.

**Fix:** Two small moves: (1) make the toggle optimistic — flip the local summary immediately, then roll back on write error (or add a per-`messageId+emoji` in-flight ref so a second click while pending is ignored); (2) reuse the existing `upsertReaction`/`dropReaction` helpers for the optimistic flip so the realtime echo (idempotent by construction) reconciles instead of double-counting.

**Effort:** Small (optimistic flip + in-flight guard + tests).

## What's sound — do not touch

- **Reactions authority & delivery**: DB `UNIQUE (message_id, user_id, emoji)` blocks duplicates at the source (`20260806120000:17`); `REPLICA IDENTITY FULL` so DELETE echoes carry the full row for count/`hasReacted` reconciliation (`:24`); archived-channel rejection on INSERT (`20260817144037_backend_command_schema.sql:74-81`); realtime INSERT/DELETE upsert/drop with stable per-message references so `React.memo` survives (`useMessages.ts:60-91`); dice-roll messages restrict their action row to reactions-only (`MessageItem.tsx:428-430`), scenes/system stay reaction-free (`:451`).
- **Immediate edits/deletes (#448)**: optimistic apply + per-message mutation tokens so a failed mutation rolls back only if no newer mutation took over (`useMessages.ts:122-132,732-767`); the realtime UPDATE echo reapplies the same server row idempotently; soft-delete keeps UPDATE-reconcile sufficient.
- **Idempotent send & roll**: errored-key reuse now on *both* message and dice-roll paths (`useMessages.ts:587-592,670-678`); pending-duplicate suppression and replace-in-place; RPC replay on `client_request_id`.
- **Unread accuracy (#437/#441/#517)**: one shared `get_user_channels_unread` now mirrors the SELECT policy for whispers (recipient/sender/GM only), skips blocked, suspended, and archived members, self-guards `p_user_id`, and totals channel+admin unread in `get_user_unread_total` for the badge (`20260907110653`, `20260907140000`, `20260915122559`); `mark_channel_read` is server-`now()`-owned with `GREATEST` for monotonicity under concurrent writers.
- **Lobby preview freshness**: `last_message_preview` is a `channels` column written by the AFTER-INSERT trigger, and the lobby's messages-INSERT subscription routes through the 2s-throttled `fetchChannels`, so previews live-update with unread (`useChannels.ts:127-138`); whisper inserts write NULL (no leak), system messages stay content-only (`20260910130000`, `20260910150000`).
- **Scroll anchoring under prepends (#284/#513/#502)**: height-delta prepend anchoring, divider re-center while anchored, `boundaryRevision`-driven foreground re-anchor, `userTookOver`/gesture refs so a real reader is never yanked (`MessageList.tsx:60-179`).
- **Push copy (#537/#533)**: markdown stripped to plain text with empty-label link/image URLs collapsed to a safe body; whisper bodies never carry content; mention routing intersected with membership (`filter.ts:69-100,151-196,247-258`).
- **X-Card lifecycle end-to-end**: catch-up + persisted `resolved_at` + GM-only RLS + `Math.max` merge + cross-device UPDATE recount + identity-free resolution system message, all generation-guarded with no false-all-clear path.
- **Turn-state integrity**: roster "Set as Active Player" routes through `set_active_players`, which re-validates GM-only + membership + not-blocked/suspended server-side; the composer still cannot touch turn state (chip removed, RPC NULL-guard).
- **Message-type authority, cross-channel stale-state guards, offline deep-link, subscribeWithRetry, boundary validation**: unchanged and verified sound in the prior two rounds; no regression found this pass.

## Intentional exclusions

Carried from `audit_pbp_chat_ux.md` / `20260904` / `20260907` (do not fix): free-form initiative; public-only dice (no hidden/GM rolls); external character sheets; single timeline, no threads/OOC split; no spoiler/statblock rendering; email future; no presence indicators; soft-delete-only messages; command-only `system`/`dice_roll` types; offline = cached shell + honest errors; one `last_read_at` write per arriving message; `created_at` catch-up cursor; per-event resolution (not a per-GM dismissal ledger); stale-but-safe lobby previews after edits/whisper-nulling (preview trigger is INSERT-only by design — an edited last message leaves the summary stale but never leaks or lies).

New deliberate choices observed this pass (do not fix):

- **Roster "Set as Active Player" is a single-select shortcut** — `handleSetActivePlayer` replaces the active set with exactly one player (`MemberList.tsx:124-140`); multi-select/clearing stays in the sidebar `ActivePlayerModal`, the documented authority. The menu label is explicit ("Set as Active Player", singular), so this is a deliberate overwrite affordance, not the silent composer side-channel that was `pbp-20260904#P2.3`.
- **Reactions on whispers carry a queryable-row metadata hint** — a reaction row on a whispered message is SELECTable by any channel member (the reactions SELECT policy is `is_channel_member`, unfiltered by whisper visibility), though it only *renders* alongside the whisper so there is no visible leak. This is the security pillar's cross-user-metadata class (`get_user_channels_unread` P2 lineage), out of scope here; flag for the security pillar if it re-audits.

## Suggested execution order

1. **P2 #1** — merge (or key) `fetchReactions` against `prev` like the message fetch; one line + a test. It closes the only "reaction disappears" flicker on mount/channel-switch.
2. **P2 #2** — optimistic reaction toggle + in-flight guard, reusing the existing `upsertReaction`/`dropReaction` helpers; small, brings the newest surface up to the dice/message bar.

Both are small, test-covered-able, and touch no architecture, schema, or dependencies. The load-bearing path — subscriptions, catch-up, idempotent sends, read-mark gating, unread counting, X-Card lifecycle, turn-state RLS — needs nothing.
