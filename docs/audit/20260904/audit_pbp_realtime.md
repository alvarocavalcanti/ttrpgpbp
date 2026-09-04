# PbP Realtime & Game-Loop Audit — 2026-09-04

## Audit Prompt

You are a Principal Engineer specializing in chat infrastructure, real-time systems, and Play-by-Post (PbP) TTRPG platforms (Myth-Weavers, Discord dice bots, RoleGate, Avrae). Audit asynchronous play correctness and the game loop of a React 19 + Supabase realtime chat app. This is a RESEARCH + REPORT task: you must NOT modify any code. Your only file output is the audit report itself.

Repo root: /Users/alvaro.cavalcanti/Projects/Personal/ttrpgpbp-chore-audit-20260904 (a git worktree — treat it as the repo root).

AUDIT CONTRACT (applies to every finding):

- Read-only audit. Do NOT modify any file except your single report file. Do NOT run `gh` or any git command. Do NOT run tests, builds, or database commands.
- Allowed verification: `npx tsc -p tsconfig.app.json --noEmit`, `npx oxlint`, plus reading files (grep/read tools).
- Every finding must cite evidence as `file:line` (relative to repo root). No evidence = no finding. Verify every claim against actual code, not docs or changelogs.
- Severity: P0 = correctness/security defect or launch blocker · P1 = significant gap, no data loss · P2 = polish/DX.
- Baselines — read these first, do NOT re-report remediated items:
  - docs/audit/20260831/phase4_audit.md (remediation matrix; [VERIFIED STABLE] rows are closed unless you find a regression; its P1/P2 lists and Watch items matter to you)
  - docs/audit/20260815/audit_pbp_chat_ux.md (your direct predecessor — its [NEW]/[OPEN]/[INTENTIONAL] markers and its "Intentional Scope Exclusions" section carry over: hidden/GM rolls and initiative structure are INTENTIONAL, do not propose them)
  - docs/audit/20260828/phase3_audit.md
- Tag every finding [NEW] (not covered before), [OPEN] (raised earlier, still unfixed — cite prior ID e.g. `chat-ux#1.2`, `phase4#P1`), or [INTENTIONAL] (list separately under Intentional Exclusions, do not propose fixes).
- Stack: React 19, Vite, TypeScript, hand-rolled Tailwind (no Shadcn), Supabase (Postgres/RLS/Realtime/Edge Functions), PWA, Node 26.

YOUR PILLAR — PbP game & realtime UX:

1. Realtime subscription path: src/features/chat/useMessages.ts, src/features/channels/useChannel.ts, src/lib/realtime.ts (subscribeWithRetry), reconnect catch-up logic. phase4 flagged: catch-up only forward-fetches INSERTs — missed UPDATE/DELETE events during a disconnect never reconcile (verify still true); admin-message channels bare `.subscribe()` (verify).
2. Send reliability: optimistic echo, `client_request_id` idempotency, retry/remove states, draft persistence, composer-resubmit double-send path (phase4 P2: fresh key on resubmit can double-post — verify).
3. Dice integrity: server-authoritative `roll_dice` (notation gate, bounds, atomicity, replay race — phase4 P2: concurrent same-key replay hits unique violation), client `dice:` link validation (phase4 P2: raw pass-through, no early failure UX).
4. Unread/read-state correctness: `last_read_at` advancement (phase4 P1: frozen while channel open — lobby badge re-counts read messages; verify if fixed), unread divider resilience to error races (chat-ux#1.6 lineage).
5. Offline/deep-link behavior: service worker navigation fallback (phase4 P1: offline /channel/:id deep-link fails — verify), offline banner quality.
6. Cross-channel stale-state guards on route change (phase3 fixed — spot-check for regressions).
7. Game-loop product audit: whispers, NPC/scene/system message authority (DB-enforced vs UI-convention — chat-ux#1.4), active-player turn flow (multi-select gap chat-ux#2.1), safety tools/X-Card visibility (phase4 Watch: X-Card broadcast reaches all members' websockets — assess current state), message content caps (chat-ux#1.5), AFK handling.
8. PbP-specific affordances: "where was I?" continuity (unread divider + catch-up), catching up after days away, scroll anchoring through prepends (chat-ux marked FIXED — spot-check), message context on errors (empty vs unavailable states).

REPORT STRUCTURE (markdown, this exact skeleton):

1. `## Audit Prompt` — reproduce this prompt verbatim (from "You are a Principal Engineer" through this bullet).
2. Header block: date 2026-09-04, scope, verification commands run + results.
3. `## Executive Summary` — short, blunt: is the load-bearing realtime wall safe now?
4. `## P0` / `## P1` / `## P2` sections. Each finding: bold title, tag, evidence `file:line`, problem (frame for PbP play impact — what happens to a player mid-campaign), suggested fix (concrete), rough effort. Order by return-on-effort within each severity.
5. `## What's sound — do not touch` — verified-correct realtime mechanics (drafts/idempotency, dedup by id, server-side push triggering, scroll anchoring).
6. `## Intentional exclusions` — carry over chat-ux's exclusions plus any new deliberate choices found; do not fix.
7. `## Suggested execution order`.

Recommendations must fit current scale — no speculative architecture, no new dependencies unless clearly justified. Respect the prior audit's intentional exclusions.

---

**Date:** 2026-09-04
**Scope:** PbP game & realtime UX pillar — realtime subscription/catch-up path, send reliability, dice integrity, unread/read-state, offline/deep-link, cross-channel stale-state, game-loop product surface (X-Card, active players, message authority, AFK), continuity affordances.
**Baseline docs:** `docs/audit/20260831/phase4_audit.md`, `docs/audit/20260815/audit_pbp_chat_ux.md`, `docs/audit/20260828/phase3_audit.md`.

**Verification commands run:**

- `npx tsc -p tsconfig.app.json --noEmit` — **passed** (no errors)
- `npx oxlint` — **passed** (clean, exit 0)
- Read-only file inspection (grep/read) of `src/` and `supabase/migrations/` — no code modified, no tests/builds/DB commands run.

## Executive Summary

Yes — the load-bearing realtime wall is safe now. Every P0/P1 from the prior three audits is verifiably closed in code, not just in changelogs: reconnect catch-up now reconciles UPDATEs (cursor-snapshot ordering is correct), `last_read_at` advances while the channel is open without moving the unread divider, the SW serves the app shell to offline deep links, suspended accounts are locked out of all command RPCs, the join oracle is throttled, definer helpers are revoked from PUBLIC, and the X-Card stream is GM-only at the RLS layer. Dice remain fully server-authoritative, and the two phase-4 dice P2s (replay race, `dice:` validation) are fixed.

What remains is small and specific: the two worst residual gaps are (1) the X-Card is still live-only — a flag pressed while the GM is away is never surfaced, which for an *asynchronous* play tool is the one place the safety tool can silently fail, and (2) the read-mark is still written before the message history is known to have loaded, so a failed first fetch destroys the "New messages" boundary the divider exists to preserve. Four P2s round it out (composer resubmit key, DB content cap, single-select composer active-player control, a draft-restore race). Nothing here blocks launch; the X-Card item is the one I'd fix before the first real table depends on it.

## P0

None.

## P1

### 1. X-Card flags are invisible to a GM who wasn't live-connected [NEW]

**Evidence:** `src/features/channels/useSafetyCardEvents.ts:13-36` (GM client subscribes to realtime INSERTs only; no query of existing events on mount, no persistence of `alertActive`/`alertCount` beyond component state), `src/features/channels/ChannelView.tsx:278-293` (banner rendered purely from live subscription state). The data layer permits GM reads: `supabase/migrations/20260831150000_issue_337_privacy_db_hardening.sql:36-44` (GM-only SELECT policy). No migration defines a "handled/resolved" concept for `safety_card_events` (`20260811120000_afk_and_safety_tools.sql:42-62`).

**Problem:** This app's whole premise is play across days and time zones. A player presses the X-Card at 2am; the GM opens the channel the next morning and sees nothing — no banner, no count, no trace in the UI. The one tool whose failure is unacceptable (player safety) is the only channel surface that exists solely as a fire-and-forget realtime toast. Dismissal is also client-local: a reload clears the alert even minutes after a live flag.

**Fix:** On mount (GM only), fetch unhandled events — one query the RLS policy already authorizes, e.g. events with `created_at > now() - interval '7 days'` joined against a lightweight `handled_at`/dismiss marker (a `safety_card_event_dismissals` row keyed by GM, or a `resolved_at` column set via a tiny GM-only RPC). Seed `alertActive`/`alertCount` from the result; persist dismissal through the same RPC. No new dependencies, no schema upheaval.

**Effort:** Small (one hook query + one column/RLS policy + tests).

### 2. Read-mark advances before history is confirmed loaded — a failed first fetch destroys the unread boundary [OPEN — chat-ux#1.6, partially remediated]

**Evidence:** `src/features/channels/useChannel.ts:117-124` — `markRead()` fires after `loadMembers()` succeeds, gated only on tab visibility, never on the messages fetch; the messages fetch is a parallel request in `src/features/chat/useMessages.ts:123-160` whose failure sets `error` without any read-mark coordination. The failure UI has no retry: `src/features/channels/ChannelView.tsx:272-276` says "Refresh the page to try again." and `src/features/chat/MessageList.tsx:197-207` renders a bare "Could not load messages." (chat-ux#1.6 asked for exactly this Retry). The live-advance path (`useChannel.ts:156-163`) likewise marks read on INSERT regardless of whether the initial history ever loaded.

**Problem:** Player opens a channel on a flaky connection. Members load (fast, small), messages time out. The channel is marked read server-side, the player sees "Could not load messages," and when they retry tomorrow the "New messages" divider — the app's entire "where was I?" answer — now sits above posts they never saw. The error-vs-empty distinction added since chat-ux#1.6 is real progress, but the data-loss half of that finding (the unread boundary) still stands.

**Fix:** Gate the mount-time `markRead()` (and the INSERT-driven advance) on `useMessages` having completed at least one successful fetch for the current channel — a `messagesLoadedRef` shared via a callback or a small context is enough. While there, wire a Retry button into the messages error banner (a `refetchMessages` already exists conceptually — the visibility handler at `useMessages.ts:382-388` performs the same catch-up).

**Effort:** Small-medium (cross-hook coordination + tests).

## P2

### 1. Composer resubmit after a failed send mints a fresh `client_request_id` — late-landing first attempt double-posts [OPEN — phase4#P2]

**Evidence:** `src/features/chat/useMessages.ts:467` (`crypto.randomUUID()` unconditionally per submit); the duplicate guard at `src/features/chat/useMessages.ts:453-465` suppresses only identical payloads whose bubble is `pending && !error` — an errored bubble is exempt; `src/features/chat/MessageComposer.tsx:217-233` — on failure the composer keeps the text and shows "Please try again," and the natural resubmit path re-enters `sendMessage` with a fresh key.

**Problem:** Player sends a long post on a train; the request times out, the bubble shows the error, the composer still holds the text. They hit send again. If the first RPC actually committed (timeout ≠ failure), the table sees the post twice. The safe path exists — the bubble's Retry reuses the key (`useMessages.ts:660`) — but nothing steers the user to it, and Remove + resend also mints a fresh key.

**Fix:** In `sendMessage`, before minting a key, look for an existing non-pending (errored) bubble with an identical `pending_payload`; if found, reuse its `client_request_id` instead of minting one — the RPC replay path returns the existing row, making this a one-branch change symmetric with the existing pending guard.

**Effort:** Small.

### 2. Message content cap is enforced by the RPC and the composer, but not by the database [OPEN — chat-ux#1.5 residual]

**Evidence:** RPC cap: `supabase/migrations/20260831150000_issue_337_privacy_db_hardening.sql:477-478` (4000 chars in final `send_message`); edit path: `supabase/migrations/20260818140000_enforce_mutation_integrity.sql:131-132` (UPDATE trigger). INSERT path: no `CHECK` on `messages.content` exists anywhere in `supabase/migrations/` (grep for `char_length(content)` returns nothing), and direct member INSERTs remain permitted by policy — `supabase/migrations/20260817144037_backend_command_schema.sql:44-67` (own-sender, member-only, but no length bound).

**Problem:** A member can POST directly to the `messages` table (PostgREST, valid session) with a multi-megabyte body; the 4000-char cap never applies. Every other member's websocket delivers it and their browser renders it — a paste-flood DoS on the table, and the one bound chat-ux#1.5 asked for that never landed.

**Fix:** One migration: `ALTER TABLE messages ADD CONSTRAINT messages_content_length CHECK (char_length(content) <= 4000);` (roll content is server-built from ≤50-char notation + ≤500-char warning, so it fits). Backfill guard: existing rows are all RPC-created and already within bound.

**Effort:** Trivial.

### 3. Composer "Active Player" menu is single-select and silently overwrites an ensemble turn [OPEN — chat-ux#2.1 residual]

**Evidence:** `src/features/chat/MessageComposer.tsx:359-363` (`onSelect` → `setActivePlayerIds([val])`, one id); `send_message` applies whatever array it receives by clearing all rows first — `supabase/migrations/20260831150000_issue_337_privacy_db_hardening.sql:529-536` region (`UPDATE channel_members SET is_active_player = false …` then set the given ids). The multi-select UI exists and works: `src/features/channels/ActivePlayerModal.tsx:31-48` (checkboxes → `set_active_players`).

**Problem:** The GM sets an ensemble turn (two players act in parallel) via the sidebar modal. Later, a message sent with the composer's Active Player chip still carrying a stale single selection rewrites the turn state down to one player — mid-scene, with "your turn" pushes fired off the new state. The composer control contradicts the shipped data model the rest of the app honors.

**Fix:** Cheapest correct move: drop the composer's Active Player menu entirely (the modal is the single authority, one less chip). If the inline control must stay, render it as a multi-check list reusing `ActivePlayerModal`'s toggle semantics.

**Effort:** Small.

### 4. Draft-restore race can clobber the destination channel's draft on a quick channel switch [NEW]

**Evidence:** `src/features/chat/MessageComposer.tsx:47-55` (restore effect: reads `composer_draft_<newKey>` and `setContent(saved)`) and `:57-62` (save effect: writes `content` under `draftKey`). On a `draftKey` change, both effects run in the same commit: restore reads the saved draft, but save executes with the *old* channel's `content` and the *new* key — writing old-channel text over the new channel's stored draft. The follow-up render (from `setContent`) rewrites the correct value, but if the component unmounts before that render lands (fast back-navigation, route change), the clobbered draft persists.

**Problem:** A player with a half-written scene post in channel A, skimming to channel B and immediately back, can lose B's draft. Low frequency, but it's exactly the "typed a paragraph, lost it" moment drafts exist to prevent.

**Fix:** Make the save effect skip the transitional pass — e.g. write drafts in a single effect keyed on `[draftKey]` cleanup (save old content to old key on key change/unmount, restore in the effect body), or guard the save with a `restoredForKeyRef` so a key change never persists stale content.

**Effort:** Small.

## What's sound — do not touch

- **`subscribeWithRetry`** (`src/lib/realtime.ts:61-112`): exponential backoff 1s→30s, retryable-status set, status aggregation into a single `Connected/Reconnecting/Offline` snapshot via `useSyncExternalStore`, online/offline listeners, clean teardown. Every subscription in the app routes through it — chat, channel/members, lobby-unread, safety-card, roll history, admin threads/messages/unread (`useAdminThreads.ts:106`, `useAdminMessages.ts:96`, `useAdminUnread.ts:44`, `useChannels.ts:126`). The phase-4 "bare `.subscribe()`" finding is dead.
- **Reconnect catch-up** (`src/features/chat/useMessages.ts:186-224, 364-380`): paginated forward INSERT catch-up with a 100-page guard, plus `reconcileUpdates` (`:234-288`) re-pulling rows by a composite `(updated_at, id)` cursor — and crucially, the cursor is snapshotted *before* catch-up advances it (`:376-377`), so offline edits can't be hidden by the INSERT pass. Held-ids-only application prevents phantom rows from pages outside the window. Phase-4 P1 (UPDATE/DELETE catch-up) is closed; hard DELETEs are correctly out of scope because every delete path in the app is a soft delete (`useMessages.ts:597-604`).
- **Idempotent sending**: partial unique index `(channel_id, sender_id, client_request_id)` (`20260817144037_backend_command_schema.sql:22-24`); both RPCs replay existing rows and catch `unique_violation` on concurrent same-key inserts (`20260831150000:365-386, 551-567`); retry reuses the bubble's key (`useMessages.ts:636-647, 651-661`); optimistic echo reconciled by id/client_request_id with join re-fetch (`:305-333`); pending-duplicate suppression for both messages and rolls (`:453-465, 531-540`); "no error but no id" surfaces a retryable state instead of hanging (`:513-517`).
- **Server-authoritative dice**: `roll_dice` wrapper enforces warning ≤500, notation ≤50, DC 1–100 (`20260831150000:166-174`); the unchecked body regex-gates notation, caps 100 dice/1000 sides, clamps the modifier to game-system bounds, rolls server-side, builds content server-side, and inserts message + `dice_rolls` atomically (`:183-395`); direct `dice_rolls` INSERT revoked since `20260817144037`. Client never computes a displayed result.
- **`dice:` link validation** (`src/features/chat/MessageItem.tsx:268-272`): click-site `isValidDiceNotation` gate kills the misleading "Rolling" bubble; `urlTransform` (`:68-84`) keeps markdown URLs sanitized while allowing `dice:`/`check:`/`user:` schemes and bare private-bucket object paths.
- **Read-state design** (`src/features/channels/useChannel.ts:22-50, 98-101, 156-163`): divider boundary captured once per mount before any write; `last_read_at` writes serialized through a promise chain (monotonic); live INSERT advance gated on tab visibility, so reconnects in a hidden tab never mark anything read. Phase-4 P1 closed without regressing the #213 divider-freeze fix.
- **Scroll anchoring** (`src/features/chat/MessageList.tsx:94-195`): prepend preserves offset via height-delta, ResizeObserver keeps bottom-pinned through lazy images, and the visibility-change restore (`:165-195`, issue #338) fixes the phase-4 "force-jump on visible" P2 — return-from-background restores the captured position or stays pinned, never yanks.
- **Cross-channel stale-state guards** (phase-3 fix, no regression): both hooks clear messages/reactions/members/error/boundary state synchronously on channel change (`useMessages.ts:107-116`, `useChannel.ts:54-66`), keyed `mounted` flags plus generation checks in admin hooks.
- **Offline deep-link** (`src/sw.ts:20-23`): `NavigationRoute(createHandlerBoundToURL('index.html'))` — `/channel/:id` offline serves the cached shell, which renders its own error states. Phase-4 P1 closed.
- **Lobby unread liveness** (`src/features/channels/useChannels.ts:108-126`): debounced messages-INSERT subscription filtered to own channels + push relay + visibility + realtime-status refetch. Phase-4 P2 closed.
- **Boundary validation** (`src/features/chat/validation.ts`): Zod at every realtime/PostgREST row boundary; `normalizeMessage` only rewrites embed keys that are actually present, so realtime UPDATE merges can never blank sender/whisper/reply embeds (`useMessages.ts:337`).
- **Security P1s from phase 4, all verified in migration code**: suspension guards in `roll_dice`/`send_message`/`set_active_players`/`update_channel_settings` (`20260831140000:70, 257, 400, 455`), windowed join-throttle table + check (`:511-613`), `REVOKE … FROM PUBLIC, anon, authenticated, service_role` on the definer helpers plus `auth.uid()` guard on `get_admin_unread_count` (`:698-708`), X-Card SELECT narrowed to GM with inlined predicate (`20260831150000:36-44`), member-insert consent trigger (`:50-65`).
- **AFK handling** (`src/features/channels/MemberList.tsx:106, 198-200` + server-side turn-push suppression verified in phase 4): `is_away` + `away_message` surfaced in the roster; push filter skips away members for turn pings.
- **Drafts** (`MessageComposer.tsx:45-62, 218-219`): per-channel localStorage restore/clear-on-success, safe wrappers for private-mode (modulo the P2 race above), textarea `maxLength={MAX_MESSAGE_LENGTH}` (`:645`).

## Intentional exclusions

Carried from `audit_pbp_chat_ux.md` (do not fix):

1. **Free-form initiative** — `status_text` markdown + manual turn advancement, no structured order.
2. **Hidden/GM rolls do not exist** — all dice are public by design.
3. **External character sheets** — links + per-system attribute modifiers only; no HP/AC tracking.
4. **No threads / sub-channels / OOC-IC structure** — one timeline per channel; whispers are the only private path.
5. **No spoiler syntax or statblock rendering** — Markdown + GFM only.
6. **Email notifications are future** — `email_enabled` is schema/UI only.
7. **No typing/presence indicators** — low-value in async play; connection state is covered by the RealtimeBanner.

New deliberate choices observed this pass (do not fix):

- **Soft-delete-only messages** — no hard-delete path exists in app code, which is precisely what lets the UPDATE reconcile cover deletions; the `ponytail:` comment in `useMessages.ts:232-233` documents the ceiling (a hard delete would require a full resync).
- **`system` / `dice_roll` message types are command-only** — rejected by both the RPC (`p_type NOT IN ('regular','scene','npc')`) and the INSERT policy; system messages originate exclusively from server paths (e.g. `join_channel` inserts the "X joined" row). Deliberate authority boundary, not a gap.
- **Offline = cached shell + honest error states, no runtime message cache** — the SW navigation fallback serves the shell; history offline is not attempted (chat-ux 3.6 recorded this as a stretch win, never requested).
- **One `last_read_at` write per arriving message while visible** (`useChannel.ts:154-155` `ponytail:` comment) — accepted write volume; debounce explicitly deferred.
- **created_at cursor in catch-up** (`useMessages.ts:193-195` `ponytail:` comment) — microsecond timestamps make boundary straddling theoretical; id-based cursor documented as the upgrade path.

## Suggested execution order

1. **X-Card catch-up + persisted dismissal** (P1.1) — safety tool must survive the GM being away; it's the reason the feature exists in an async app. Small, self-contained hook + column change.
2. **Gate `markRead` on successful message load + wire the messages Retry** (P1.2) — closes the last "where was I?" data-loss path; pairs naturally with the existing visibility-refetch.
3. **Reuse the errored bubble's `client_request_id` on composer resubmit** (P2.1) — one branch, removes the last double-post window.
4. **Drop or multi-select the composer's Active Player menu** (P2.3) — removes a silent turn-state overwrite; decide drop-vs-multi in one sitting.
5. **`messages_content_length` CHECK migration** (P2.2) — trivial, run it with the next migration batch.
6. **Draft-restore race guard** (P2.4) — smallest item, do it whenever the composer is next touched.

Items 1–2 are the launch-adjacent pair; 3–6 are ordinary follow-ups and none require new dependencies or architectural change.
