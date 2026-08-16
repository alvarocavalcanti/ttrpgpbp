# Play-by-Post Chat & Real-Time UX Audit

Date: 2026-08-15
Scope: Asynchronous play mechanics, narrative engagement, and real-time chat UX in RoleByPost (React 19 + Vite + Supabase/Postgres + service-worker PWA).

Reviewer lens: Principal Engineer / UX specialist in chat infrastructure, real-time systems, and PbP TTRPG platforms (Discord-bot / Raid-style architectures, Myth-Weavers, RoleGate, Avrae).

## How to read this document

Two markers distinguish these findings from the earlier audit (`docs/audit/20260812/audit_ux_features.md`):

- **[NEW]** — net-new finding specific to the PbP/chat/async lens, not covered in the 20260812 audit.
- **[FIXED] / [OPEN]** — disposition relative to a finding first raised in the 20260812 audit. `[FIXED]` means the shipped code has since addressed it; `[OPEN]` means it still stands.

Prioritization: **P0** = correctness/integrity of async play or chat, **P1** = significant async/chat UX gap, **P2** = polish / DX.

Deliberate scope exclusions (confirmed product intent, not defects) are listed at the end under *Intentional Scope Exclusions*.

## Executive Summary

RoleByPost has the correct bones for async tabletop play: one timeline per campaign channel, clickable dice notation, GM-run scene/NPC narration, whispers, replies/reactions, per-channel notification prefs, and a server-side push pipeline that no longer depends on the sender's browser. Real-time message delivery over the Supabase `postgres_changes` subscription is the load-bearing wall for the whole experience.

That wall has no safety rails. The chat client is a thin read-modify-write proxy over Postgres with **no reconnect/resync**, **no optimistic echo**, **no send queue**, and **no draft persistence** — so a dropped network mid-campaign silently eats a player's post or leaves their screen stale with no recovery affordance. The single most trust-critical gap for a *tabletop* context is dice: rolls are computed in the browser with `Math.random()` and the result is persisted by the caller, so any player can post a fabricated roll and no one (including the GM) can tell.

The strengths worth preserving and building around:

- **Server-side push triggering** is done right — a DB trigger → `pg_net` → edge function fires pushes independent of the sender's session (`supabase/migrations/20260814120000_server_side_push_trigger.sql`, `supabase/functions/push-notifications/index.ts`). Mention routing is re-parsed server-side from persisted markdown chips, not trusted from the client (`filter.ts:153-174`). **[FIXED]**
- **Scroll anchoring on history prepend** is handled explicitly (`MessageList.tsx:60-82`) — a fix the 20260812 audit requested and shipped code delivered. **[FIXED]**
- **Message INSERT dedup by id** protects against duplicate realtime delivery (`useMessages.ts:168,172`).
- **Latest-N windowing** with load-older keeps memory bounded and, unlike the prior "load whole history" behavior, keeps large campaigns usable. **[FIXED]**

---

## 1. Critical Async/Chat Fixes

### 1.1 P0 — Dice rolls are client-computed, client-persisted, and forgeable **[OPEN]**

The roll is computed in the browser (`parseAndRoll` → `Math.random()` at `src/features/dice/parser.ts:83`), formatted, and the result row is inserted by the same caller (`src/features/chat/useMessages.ts:302-347`). The `dice_rolls` INSERT policy only checks membership + `roller_id = auth.uid()` (`supabase/migrations/20240801000000_init_schema.sql` "Members can insert dice rolls"); `notation`, `result`, and `breakdown` are client-supplied and never re-derived.

Consequences for a tabletop game:

- A player can post any result they want and it renders identically to a real roll, with a matching history entry.
- `Math.random()` is not cryptographically random and is not seedable/committable, so there is no verifiability story at all.
- The message insert and the `dice_rolls` insert are two separate statements; a failure between them leaves a visible roll with no history entry (`useMessages.ts:314-346`).

Recommended direction (aligns with the 20260812 P0 but framed for tabletop integrity): move roll evaluation into a single server-side operation — a Postgres function that both rolls and inserts atomically, returning the authoritative result — so the client sends notation and receives the result. Until then, at minimum label client-authoritative rolls in the UI ("local roll") so players/GMs can agree on trust rules. See 2.2 for the related hidden-roll gap.

### 1.2 P0 — No reconnect handling, resync, or catch-up for the realtime subscription **[OPEN]**

`useMessages` and `useChannel` call `.subscribe()` and never inspect status, retry, or refetch after a disconnect (`src/features/chat/useMessages.ts:145-210`, `src/features/channels/useChannel.ts:84-116`). The Supabase client is created bare with no `realtime` reconnect config (`src/lib/supabase.ts:11`).

For async PbP this is the difference between "I missed your post" and "I'll pick it up when I reconnect":

- A phone switching networks, a laptop sleeping, or a backgrounded tab silently drops the socket. Messages posted during the gap never arrive; there is no connection banner, no status surface, no "N new messages since reconnect" catch-up. The only recovery is a full page reload.
- The initial fetch and the subscription start concurrently (`useMessages.ts:142-145`); there is no reconciliation step, so the ordering guarantee between the fetched window and live inserts is by `id`-dedup only (`useMessages.ts:168,172`) — correct for duplicates, but it cannot recover *missed* messages.
- The same gap applies to member/channel state: `channel_members` subscriptions handle INSERT/DELETE/UPDATE (`useChannel.ts:106-114`) but nothing refetches after a reconnect.

Recommendation: expose subscription status (`SUBSCRIBED`/`CHANNEL_ERROR`/`TIMED_OUT`), surface a reconnect banner, and on re-entry refetch the newest page and reconcile by `id`. For the sender path, see 1.3.

### 1.3 P0 — No optimistic echo, no send queue, no retry; a failed send loses the post **[OPEN]**

`sendMessage` performs a single `messages` insert and returns; the UI does not render the sender's message until the realtime INSERT round-trip delivers it back (`useMessages.ts:244-300`). On failure the composer shows "Failed to send message. Please try again." but the typed text is cleared only on success — content survives the error, but there is no queue, no retry button, no offline draft. If the network drops between submit and insert, the post is lost with no affordance to recover it.

For long-form PbP posts (paragraphs of narration) this is the single worst interaction: users type on mobile, hit send walking through a dead zone, and the work vanishes. Recommendation: optimistic append with a pending/tombstone state, reconcile by `id` when the realtime INSERT lands, and a retry/`resend` affordance on failure. At minimum, persist the unsent composer text (`localStorage` per channel) — see 3.1.

### 1.4 P1 — `scene`, `system`, and `dice_roll` message types are not DB-enforced **[NEW]**

The messages INSERT policy gates membership + own-sender, and only adds a GM gate for `type = 'npc'` (`supabase/migrations/20260810172633_channel_npcs.sql:37-43`). Scene (narrated by GM), system (backend-authored), and dice_roll types are UI conventions only: any member can insert `type='scene'` or `type='system'` with arbitrary content, and only the composer's GM visibility keeps scene messages GM-only in practice.

For narrative integrity this matters: a scene break and a system message both carry "authority" styling and are read as GM/table framing, not player chatter. Recommendation: extend the INSERT `WITH CHECK` so `type IN ('scene','system')` also requires `is_channel_gm(channel_id)`, mirroring the existing `npc` gate.

### 1.5 P1 — No message length cap or large-payload handling **[NEW]**

`content TEXT NOT NULL` is unbounded (`init_schema.sql:133`) and the composer textarea has no `maxLength` (`MessageComposer.tsx:541-549`). There is no client-side cap, no server-side check, no paste-flood guard, no pagination of individual message bodies, and no truncation for rendering. A pasted novel, a binary blob, or a runaway autocomplete produces a multi-MB row and a giant DOM node with no graceful path.

Recommendation: enforce a sane content cap at both input (`maxLength` on the textarea, per AGENTS.md validation rules) and DB (CHECK on `char_length(content)`), and keep a visible counter. Large-image handling is already bounded (client-side JPEG resize + admin size cap, `useImageUpload.ts`), so this is a text-only gap.

### 1.6 P1 — Unread state is marked read before history renders; error state confuses "empty" with "unavailable" **[OPEN]**

`last_read_at` is updated in `fetchChannelData` before messages finish loading (`useChannel.ts:62-73`), and the "No messages yet" empty state is indistinguishable from a failed load with an empty array (`MessageList.tsx:84-94` — error branch only renders when `messages.length === 0`). A transient messages fetch failure therefore both marks the channel read *and* shows "No messages yet. Say hello!" to a player who just lost their unread boundary.

This is an async-play correctness bug: the "New messages" divider (`MessageList.tsx:131-139`) is the player's answer to "where was I?", and it is destroyed by a failure race. Recommendation: mark read only after the first successful messages render (or the channel mount's message fetch resolves), and give the empty-with-error state an explicit "Could not load messages — Retry" (a Retry exists in `ChannelView.tsx:126-131` for the channel fetch; wire it for messages too).

---

## 2. TTRPG Feature Enhancements

### 2.1 P1 — Initiative/active-turn state is manual and single-track **[INTENTIONAL — see exclusions, with one real gap]**

The initiative tracker is free-form markdown in `status_text` (`ChannelStatusBar.tsx:78`) and turn is a single `is_active_player` boolean on each member (multiple can be active, `SCHEMA.md`), driven by a single-select GM control in the composer (`MessageComposer.tsx:355-374`). The GM hand-writes the order and hand-advances turns. Push for "It's your turn" is wired server-side and AFK-aware (`filter.ts:71-85`) — solid.

The one genuine defect in this otherwise-intentional design: the composer control is **single-select** while the schema, status bar (`ChannelStatusBar.tsx:56-67`), docs, and push logic all support **multiple** active players. A GM setting an ensemble turn is forced to pick one name. Fix the control to multi-select to match the shipped data model (this is the same gap as 20260812 UX#17). **[OPEN]**

### 2.2 P1 — No hidden/GM rolls; all dice are public **[INTENTIONAL]

There is no secret-roll concept anywhere: no `secret`/`gm_only` flag on dice rolls, no "roll behind the screen" path, no whisper-scoped roll. Per exclusion, hidden rolls are not in scope — but note the interaction with 1.1: without server-authoritative rolls *and* without hidden rolls, the GM also has no trusted private die — fudge-checks and secret DCs are impossible, which pushes tables to physical dice or third-party tools. If hidden rolls ever enter scope, they should land on top of the server-side roll function from 1.1 rather than be bolted onto the current client-side path.

### 2.3 P1 — OOC/IC separation is single-timeline with no structure **[INTENTIONAL — one adjacent gap]**

Per exclusion, threads/OOC-channels are out of scope. The existing escape valves are whispers (GM + one player, RLS-scoped, `init_schema.sql:147-158`) and scene messages as narrative breaks. The adjacent gap worth closing without adding threading: **no lightweight OOC marker**. A player's "okay, back in ten" reads identically to an in-character post. A single character/slash prefix (e.g. `//` or `(OOC)`) rendered as a visually distinct, push-suppressed-on-demand "OOC" bubble would give tables the IC/OOC distinction they already run by convention, with one field on the message. If that's also unwanted, skip — this is the cheapest possible answer, not a recommendation to build threading.

### 2.4 P2 — Markdown covers most formatting; spoilers and statblocks excluded **[INTENTIONAL]**

`react-markdown` + `remark-gfm` powers messages, scenes, NPC, and status text (`MessageItem.tsx:303,463`, `ChannelStatusBar.tsx:109`); dice notation and ability checks are linkified into roll buttons (`parser.ts:31-44`), replies quote the source (`MessageItem.tsx:224-238`), and reactions render with live counts. No spoiler syntax, no statblock component — both confirmed intentional. Nothing to do here; recorded for completeness since the rich-text surface is the strongest part of the narrative UX.

### 2.5 P2 — Mentions are name-based and ambiguous **[OPEN]**

Mentions autocomplete and linkify by `@CharacterName` (`MessageComposer.tsx:74-104`, `mentions.ts:19-48`): matching is case-sensitive prefix, duplicate character names collapse to the first member (`mentions.ts:37-40`), and the chip resolves to `user:<id>` only at send time. Wrong-person pings are possible in a table where two players share a name, and the mention chip in rendered history (`MessageItem.tsx:201-207`) has no disambiguating context.

Recommendation: key the autocomplete on member `user_id` (keep the display name), insert the resolved chip at selection time (Discord-style), and dedupe by name during linkification by disambiguating — matching the 20260812 P2 but worth raising here because misrouted mentions directly misroute push notifications (see 2.6).

### 2.6 P1 — Push routing is sound but mention → turn → unread coherence is incomplete **[NEW]**

The push pipeline is the strongest realtime component: DB trigger → `pg_net` → edge function with a shared-secret trust boundary (`push-notifications/index.ts:179-188`), server-side mention re-parsing (`filter.ts:94-113`), blocked-member and AFK exclusion (`filter.ts:71-85,121-124`), and per-channel prefs (`notify_all_messages` / `notify_gm_messages` / `notify_turn`). Gaps:

- **No in-app notification center / history.** Notifications exist only as push tray + launcher badge; a dismissed notification is gone forever, and there is no list of "who mentioned you while you were away." For async games played across days this is the single biggest missing surface. Email delivery is a confirmed future feature (see exclusions).
- **No unread catch-up on reconnect** — ties directly to 1.2: the badge is refreshed when a push arrives (`sw.ts:29-33`) and on channel read (`channelRead.ts`), but a reconnect that missed pushes gets no badge refresh, so the launcher icon undercounts.
- **Badge counts only on push, not on open.** Reading one channel refreshes the total via `get_user_channels_unread` (`channelRead.ts:12-14`) — good — but there is no polling/periodic refresh when pushes stop.

### 2.7 P2 — Roll history is read-only, no filtering **[NEW]**

`RollHistoryModal` shows per-channel rolls (`src/features/dice/RollHistoryModal.tsx`); `dice_rolls` stores structured `breakdown` (`SCHEMA.md`) but the history view has no author/date/type filters and no link back to the message. For GM adjudication (spot-checking a contested roll) this is a daily-use gap. Cheap win: filter by roller + jump-to-message, reusing the existing `onJumpToMessage` mechanism.

---

## 3. DX Quick Wins

### 3.1 P1 — No draft saving; long posts are lost on nav/unmount **[NEW]**

Composer content lives in local `useState` (`MessageComposer.tsx:33`) and is cleared after send. Navigating away, closing the tab, or an unmount discards an in-progress long post. For PbP this is the classic "typed a paragraph, lost it" rage moment, and it compounds 1.3 (send failure also loses the post unless the user manually copies it). Recommend `localStorage` per `channelId` draft with restore-on-mount and clear-on-send. This is the cheapest high-value win in the whole audit.

### 3.2 P1 — No typing/presence indicators (and no offline indicator) **[NEW]**

No presence infrastructure exists at all — no "typing…", no online/away state beyond the manually-set AFK (`SCHEMA.md` `channel_members`). Typing indicators are low-value in pure async play (players post when they post), so skip them; but the *absence of any connection state* (1.2) means players cannot tell "nobody has posted" from "I'm disconnected." A minimal `SUBSCRIBED`/reconnecting indicator (and the banner from 1.2) fixes the perceived-staleness problem without presence.

### 3.3 P1 — No edit history; only an `is_edited` flag **[NEW]**

Edits within 15 minutes mark `is_edited = true` and overwrite content (`useMessages.ts:349-355`); there is no revision trail. In a collaborative narrative, a quietly-retconned post can rewrite the shared fiction with no audit. Cheap fix: an `edit_history` JSONB column appending `{content, edited_at}` on update, surfaced as "edited (x2)". Low priority for launch, high value for trust.

### 3.4 P1 — Screen readers are blind to the chat: no `role="log"`, no `aria-live` **[OPEN]**

The message region is a plain scrollable `div` (`MessageList.tsx:97`) with no accessible name, no `role="log"`, no `aria-live`. New messages and dice rolls arrive silently for assistive-tech users — for a *dice-rolling* app this is a genuine exclusion: a blind player cannot know a roll happened, let alone its result. Spinners are also visual-only (no `role="status"`/`aria-busy`). Recommend `role="log" aria-live="polite"` on the message list (announce newly appended messages, not full history), an `aria-live` announcement for roll results (politely), and `aria-busy` during history load. Matches the 20260812 P2 but is elevated here because dice results are core gameplay, not chrome.

### 3.5 P2 — Large-payload UX is handled for images, not text **[NEW]**

Image uploads are well-bounded (client resize → JPEG, admin size cap, retention cleanup, `useImageUpload.ts` + `cleanup-images` edge function). Text has none of that (see 1.5). No action beyond 1.5.

### 3.6 P2 — PWA is precache-only; no offline read of channel history **[NEW]**

`sw.ts` does `precacheAndRoute(self.__WB_MANIFEST)` — assets only, no runtime cache, no offline message read. A player on a commute/plane with a cached shell gets a blank channel. Given the realtime gap (1.2), an offline cache of the last-loaded window plus a "stale / offline" banner would make the PWA feel native. Medium effort; note as a stretch win.

### 3.7 P2 — Email preference exists with no delivery path **[FUTURE]**

`notification_preferences.email_enabled` ships and is exposed in Profile Settings (`usePushNotifications.ts`, `SCHEMA.md`) but no email delivery exists anywhere. Confirmed future feature — recorded so the flag and its UI are understood as forward-looking, and so any future email work reuses the trigger → `pg_net` architecture rather than the browser path.

---

## Intentional Scope Exclusions (confirmed product intent)

The following are deliberate design decisions, not defects — recorded so future reviewers don't re-raise them:

1. **Initiative tracker is free-form** (`status_text` markdown + manual active-player selection), not a structured order with automatic turn advancement. *(Only the single-select vs. multi-select mismatch at `MessageComposer.tsx:355-374` is a genuine defect — 2.1.)*
2. **Character sheets are external links + per-system attribute modifiers** — no integrated sheet, no HP/AC tracking, no auto-sync.
3. **No threads / sub-channels / OOC-IC structure** — one timeline per channel; whispers are the only private channel.
4. **No spoiler syntax or statblock rendering** — Markdown + GFM only.
5. **Email notifications are a future feature** — `email_enabled` is schema-and-UI only.

---

## Recommended Delivery Order

1. **Server-authoritative dice** (1.1) — the trust-critical tabletop gap; also the prerequisite for any future hidden-roll feature (2.2).
2. **Reconnect + resync + optimistic send queue** (1.2, 1.3) and **draft persistence** (3.1) — the async-resilience trio; without it, real-time delivery is the platform's single point of failure.
3. **Unread correctness** (1.6) and **type enforcement** (1.4, 1.5) — cheap DB/UI guards that protect narrative integrity.
4. **Screen-reader access to the log** (3.4) and **mention disambiguation** (2.5) — inclusion + correct notification routing.
5. **In-app notification center + badge catch-up** (2.6) — the biggest async-engagement surface after the resilience work.
6. **Edit history, roll-history filters, multi-select active players** (3.3, 2.7, 2.1) — polish that compounds tabletop trust.

## Definition of Async-Chat Readiness

- Rolls are authoritative or visibly labeled local; the GM has a trustworthy private path when hidden rolls land.
- A disconnect is visible, and reconnect restores every message and unread boundary without duplicates or gaps.
- A send that fails never loses the text; long posts survive navigation.
- Screen-reader users hear new messages and dice results; the chat log is announced as a log.
- The sender's own message appears immediately (optimistic) and reconciles with the server truth.
