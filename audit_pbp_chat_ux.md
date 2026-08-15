# PbP Chat and Real-Time UX Audit

<!-- cspell:ignore forgeable nonintrusive TTRPG statblock statblocks blockquotes retcons linkification affordances -->

Date: 2026-08-15
Scope: asynchronous play, narrative engagement, real-time chat UX, dice, notifications, accessibility, and mobile behavior.

## Executive Summary

RoleByPost has strong PbP foundations: one persistent campaign timeline, Markdown/GFM rendering, scene and NPC presentation, whispers, replies, reactions, character modifiers, active-player flags, server-triggered push notifications, unread badges, and bounded message history.

Primary risk is trust and continuity. Realtime subscriptions have no visible connection state or recovery path. Failed sends have no retry queue or optimistic pending state. Dice are evaluated in the browser with `Math.random()` and both message and roll audit rows accept client-provided results. Long-form PbP posts have no durable draft path, and screen readers receive no chat-log or dice-result announcements.

## Priority Summary

| Priority | Finding | Evidence |
| --- | --- | --- |
| P0 | Realtime disconnects can silently lose message and state updates. | `src/features/chat/useMessages.ts:145-210`; `src/features/channels/useChannel.ts:84-122` |
| P0 | Dice results are client-authoritative and forgeable. | `src/features/dice/parser.ts:47-83`; `src/features/chat/useMessages.ts:302-347` |
| P0 | Unread RPC trusts caller-supplied user ID. | `supabase/migrations/20260812160000_user_channels_unread.sql:4-18` |
| P1 | Send, active-player, and dice mutations are not atomic or retryable. | `src/features/chat/useMessages.ts:244-347` |
| P1 | Text payload size is unbounded. | `src/features/chat/MessageComposer.tsx:541-549`; `supabase/migrations/20240801000000_init_schema.sql:128-140` |
| P1 | Chat has no assistive-technology live announcements. | `src/features/chat/MessageList.tsx:97-160` |
| P1 | Drafts and edit history are not durable. | `src/features/chat/MessageComposer.tsx:33`; `src/features/chat/useMessages.ts:349-355` |

## Critical Async/Chat Fixes

### 1. Realtime Resilience and Catch-Up

`useMessages`, `useChannel`, `RollHistoryModal`, and `useSafetyCardEvents` call `.subscribe()` without inspecting `SUBSCRIBED`, `CHANNEL_ERROR`, or `TIMED_OUT` status. They do not retry, resync, or refetch after browser sleep, mobile network changes, tab suspension, or websocket loss.

Impact:

- Messages posted during a disconnect never enter local state.
- Member joins, kicks, channel changes, safety alerts, and roll history can remain stale.
- There is no connection banner, reconnect affordance, or indication that the timeline may be incomplete.
- Initial fetch and subscription start concurrently. ID deduplication prevents some duplicates but cannot recover missed rows.

Recommendation:

- Expose subscription status from each realtime hook.
- Show `Connected`, `Reconnecting`, and `Offline` state without blocking already-loaded chat.
- On reconnect and page visibility return, fetch the newest window and reconcile by message ID and a deterministic `(created_at, id)` cursor.
- Refresh unread totals after recovery.
- Add tests for disconnect, retry, missed insert, duplicate insert, and reconnect ordering.

### 2. Reliable Sends and Mutation Recovery

`sendMessage` waits for a database insert and relies on realtime to echo the sender's message. It has no optimistic pending item, idempotency key, offline outbox, or retry action. The composer retains content when the insert fails, which is useful, but the user gets only a generic error and no durable recovery path.

Active-player updates are separate statements after message insertion. A post can succeed while turn-state updates fail. Dice sends insert a message first and a `dice_rolls` row second; failure between them leaves a visible roll without its structured history record.

Recommendation:

- Add client-generated mutation IDs and a small per-channel outbox persisted in IndexedDB or local storage.
- Render pending and failed states; provide Retry and Remove actions.
- Make server operations idempotent by mutation ID.
- Move message plus dice-roll creation into one server transaction.
- Move message plus active-player selection into one server operation when both are requested.

### 3. Dice Integrity and Visibility

`parseAndRoll` uses `Math.random()` in the browser. `sendDiceRoll` then writes the formatted result and breakdown from the client. RLS verifies membership and roller identity, but does not recompute `notation`, `result`, or `breakdown`. A caller can fabricate a roll that looks identical to a genuine roll.

The dice UI also has no hidden/GM-only roll path. This is an intentional product scope decision, but it means all current rolls are public and none are independently trusted.

Recommendation:

- Evaluate notation and randomness on a trusted server operation.
- Insert message and structured roll atomically, returning authoritative data to clients.
- Use cryptographically secure randomness with unbiased bounded sampling.
- Validate notation and modifier bounds on the server, not only in the browser.
- If hidden rolls are added later, add explicit audience/RLS semantics on top of server-authoritative rolls.
- Until server authority exists, label client-authoritative rolls clearly rather than presenting them as verifiable.

### 4. Unread and Read-Boundary Correctness

`useChannel` updates `last_read_at` as soon as channel/member loading completes, independently of message loading. It can mark a channel read before history renders or before a failed message fetch is recovered. `notifyChannelRead` refreshes the badge only after that one visit path; reconnects and missed pushes do not refresh it.

`get_user_channels_unread(p_user_id)` is granted to authenticated callers but does not assert `p_user_id = auth.uid()`. Any authenticated caller who knows another user ID can request that user's channel IDs and unread counts.

Recommendation:

- Mark read only after the first successful message synchronization, or explicitly define view-entry as read and preserve a separate unread boundary.
- Add a message-specific Retry action while keeping channel data usable.
- Refresh unread totals after reconnect, visibility return, and foreground resume.
- Change the RPC to use `auth.uid()` internally or reject mismatched IDs; add an RLS/RPC regression test.
- Keep whisper filtering consistent in every unread-count query.

### 5. Message Authority and Payload Limits

The messages table uses unbounded `TEXT`, and the composer textarea has no `maxLength`, counter, paste guard, or server-side character constraint. Modifiers in the dice panel also have no explicit bound. A very large paste can create a large row, expensive Markdown parse, oversized DOM subtree, and push payload work.

The database insert policy restricts NPC messages to the GM, but `scene`, `system`, and `dice_roll` are otherwise type conventions. A member can submit a row that renders with GM/system authority styling.

Recommendation:

- Choose and document a message character limit appropriate for long PbP posts.
- Enforce it at input and database boundaries; reject rather than silently truncate.
- Add counters and clear inline errors.
- Bound dice modifiers and validate all roll inputs server-side.
- Enforce authoritative message types in RLS or trusted RPCs.
- Keep image safeguards: client resize, admin size setting, storage policy, and retention cleanup are already present in `useImageUpload.ts` and the cleanup function.

### 6. Scroll and Partial-Failure Behavior

History prepend anchoring is implemented in `MessageList`, and that behavior should remain. However, every appended realtime message calls `scrollIntoView({ behavior: 'smooth' })`, regardless of whether the reader is already viewing older content. A player reading a long scene can be pulled away from their position by a new post.

Message loading errors remain a banner with “Refresh the page”; there is no local retry. The empty state itself correctly distinguishes an error when the list is empty, but recovery is still coarse.

Recommendation:

- Auto-scroll only when the reader is already near the bottom or is the sender.
- Show a nonintrusive “N new messages” control when the reader is away from bottom.
- Preserve prepend anchoring and add tests for append while scrolled up, append near bottom, and retry after message-fetch failure.

## TTRPG Feature Enhancements

### Intentional Scope, Keep Unchanged

- Initiative and active-player tracking remain manual/free-form. `status_text` supports Markdown for initiative, timers, and context; `is_active_player` drives turn pushes. Do not replace this with automatic initiative automation.
- One channel has one timeline. Whispers and replies remain the current private/context tools. Do not add threads or sub-chat architecture.
- Markdown/GFM remains the formatting model. Do not add spoiler syntax or statblock rendering.
- Character sheets remain external URLs plus per-system numeric modifiers. No integrated sheet synchronization is currently required.

### Narrative and Interaction Findings

Existing narrative strengths:

- `scene` messages create visual scene breaks.
- NPC messages snapshot name and portrait, preserving historical identity.
- Replies quote source context and can jump to the source message.
- Markdown, blockquotes, lists, links, images, dice links, check links, mentions, and reactions are supported.
- Whisper visibility is enforced through message RLS for GM, sender, and target.

Gaps worth considering without changing the intentional architecture:

- Mention autocomplete is name-based. Duplicate character names collapse to the first matching member, so a mention can notify the wrong player. Resolve selection by member ID and display disambiguating profile information.
- `RollHistoryModal` loads only the newest 50 rolls, has no roller/date filter, and has no jump-to-message link. Add those only if GM adjudication needs them.
- There is no in-app notification center. Push and badges are useful, but dismissed notifications leave no “mentions or turns while away” history.
- There is no typing or presence infrastructure. For asynchronous PbP, connection state is more valuable than “typing” indicators; prioritize the reconnect banner.
- Edits overwrite content and set only `is_edited`. A revision trail would improve narrative trust if retcons become a product concern.

### Notifications

The server-side push path is sound: database trigger, `pg_net`, shared-secret edge-function boundary, server-side mention extraction, blocked-member filtering, away-player turn suppression, and per-channel preferences. The browser is no longer required to remain open for message-triggered delivery.

Remaining risks:

- Push configuration can be absent and triggers then skip delivery with only a database notice.
- Badge state can become stale after missed pushes or websocket loss.
- There is no in-app notification history or reconnect catch-up.
- Mention routing inherits name ambiguity from client linkification, although server-side persisted-chip parsing correctly avoids trusting a caller-supplied recipient list.

## DX Quick Wins

### Drafts

`MessageComposer` stores content only in component state. Navigation, reload, modal transitions, or unmount discard long-form writing. Persist drafts per channel, restore them on mount, and clear them only after confirmed send. Add tests for restore, channel isolation, clear-on-success, and retention-on-failure.

### Accessibility

`MessageList` is a plain scrollable `div` with no accessible name, `role="log"`, or `aria-live`. Incoming messages and dice results are silent to screen readers. Loading spinners are visual-only in several views.

Recommendation:

- Add a labeled chat log with `role="log"` and carefully scoped polite announcements.
- Announce new dice results separately, avoiding rereading the entire history.
- Use `aria-busy` during initial and older-history loading.
- Give retry/error states semantic roles and actionable controls.
- Preserve existing visible labels, keyboard mention navigation, Escape-to-close behavior, and avatar decorative alt text.

### Mobile and Modal UX

The channel uses `100dvh`, responsive layout, a mobile sidebar, and touch-aware composer hints. Remaining issues are focus management and recovery affordances: the mobile sidebar and overlay do not establish a focus trap or reliably return focus, and some icon-only close/menu controls depend on surrounding context. Test keyboard and screen-reader flows at narrow widths, including keyboard-visible mobile browsers and long composer content.

### Verification Coverage

Add focused tests before implementation is considered complete:

- Realtime status transitions, reconnect refetch, duplicate/missed event reconciliation.
- Optimistic send, retry, idempotency, offline queue, and mutation failure.
- Server-authoritative roll validation, atomic persistence, and visibility policy.
- Unread RPC identity enforcement and read-boundary timing.
- Message length, modifier bounds, paste behavior, and large Markdown rendering.
- Draft persistence and edit-history behavior.
- `role="log"`, live announcements, loading/error semantics, and mobile focus.
- Existing scroll-anchor behavior must remain covered.

## Recommended Delivery Order

1. Server-authoritative atomic dice operation and RPC identity enforcement.
2. Realtime status, reconnect resync, unread catch-up, and connection UI.
3. Reliable mutation path: pending state, retry, idempotency, and draft persistence.
4. Message/type/payload validation at UI and database boundaries.
5. Screen-reader chat-log and dice announcements.
6. Mention disambiguation, roll-history navigation, edit history, and notification center if product demand justifies them.

## Async-Chat Readiness Criteria

- Disconnects are visible and recovery restores messages, member state, and unread boundaries without gaps or duplicates.
- Failed sends never discard text and can be retried safely.
- Dice results are server-authoritative or explicitly labeled as local/unverified.
- Long-form posts survive navigation and transient network failure.
- Screen-reader users receive new-message and dice-result announcements.
- Readers browsing history are not pulled to the bottom by unrelated appends.
- Manual initiative, single-timeline chat, no threads, no spoilers, and no statblocks remain unchanged.
