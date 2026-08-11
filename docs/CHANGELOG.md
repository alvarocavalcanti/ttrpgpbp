# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **AFK / Away status** — any player can mark themselves away from the member-list menu, optionally with an away message ("Away until Monday"). Away members show an AFK badge, a faded/grayscale avatar, and their away message in the member list, and their name appears struck-through with an (AFK) tag in the active-player status bar. While away, "It's your turn" push notifications are suppressed (enforced in the push-notifications edge function).
- **Safety Tools: Lines & Veils** — a collapsible "Safety Tools (Lines & Veils)" section in GM Channel Settings holds persistent hard-limits (Lines) and off-screen-topics (Veils) text. All members can view them via the new **Safety Tools** sidebar item.
- **Safety Tools URL** — an optional link (e.g. a shared Google Doc) configured by the GM in settings and surfaced to every member as a **Safety Tools Doc** menu item in the sidebar, matching the Map/Resources URL pattern.
- **Digital X-Card** — a card-with-X button on each message and in the composer lets any player anonymously flag a scene to the GM. No identity is stored (`safety_card_events` rows carry no `user_id`); the GM gets an instant in-app alert banner via realtime, and the presser gets a private confirmation toast.

### Fixed

- **X-Card alert never reached the GM** — the `safety_card_events` SELECT RLS policy used `is_channel_gm()`, a `SECURITY DEFINER` function that Supabase Realtime would not evaluate for event delivery, so the GM's banner never fired. Switched the policy to `is_channel_member()` (same pattern as `message_reactions`); the client still surfaces the alert only for the GM. The alert is now a single dismissable sticky banner — the redundant info toast on X-Card was removed.

- **Server admin view** — a "Server Admin" menu item (visible only to `server_admin`) opens an admin area at `/admin` with three tabs: Users (name, channel count, join date), Channels (name, system, member count, created and last-active dates), and Settings. Settings lets the admin edit the **Maximum Channels per user** value (minimum 10, persisted in a new `app_settings` table). Users already over a lowered limit keep their existing channels — nobody is kicked.
- **Admin-configurable channel cap** — the per-user channel limit now reads from `app_settings.max_channels_per_user` (seeded at 10) instead of a hardcoded constant. The lobby, create-channel modal, and `join_channel` RPC all use the live value, falling back to 10 if unset.
- **GM/Player role badges in the lobby** — each channel in the lobby list now shows a "GM" badge when the user runs that channel and a "Player" badge otherwise.
- **NPC messages (GM-only)** — GMs can speak as NPCs with a name and portrait. NPC mode lives under the composer "+" options; typing a new name creates the NPC on the fly (random game-icons.net portrait), reusing an existing one reuses its portrait, and a picker lets the GM search game-icons.net for a specific icon. NPC messages render as parchment-styled bubbles with the NPC name + portrait, respect the 15-minute edit/delete window, support whispers and replies, and appear in search/export/pushes attributed to the NPC. Past messages keep a name/portrait snapshot even if the NPC is later renamed/repictured.
- **Channel limit per user** — non-server-admins can join at most 10 active channels. The lobby "Create Channel" button greys out at the cap and shows a toast explaining why; the `join_channel` RPC enforces the same limit server-side. A single `server_admin` flag on `profiles` (managed directly in the DB) exempts the admin from the cap.
- **System messages on member events** — a channel now posts a system message when a player joins, leaves, is kicked, or is blocked.
- **Private channels only** — public channels are no longer supported. The lobby lists only the private channels the user has joined (no tabs), and joining a channel always happens through its invite link, with an optional password. The `is_public` column and its RLS policy/helper are removed.
- **PWA high-resolution icons** — added `public/manifest.json` plus 192×192 and 512×512 PNG icons so installing the app to a phone home screen shows a proper icon instead of a blank one.
- **Character name length limit** — channel character names are capped at 20 characters, enforced in the UI, by a DB CHECK constraint, and inside `join_channel` (existing values are truncated on migration).

### Fixed

- **Mobile sidebar stayed open behind overlay modals** — opening Settings, Search, Rolls, or notification settings from the sidebar on mobile no longer leaves the slide-in sidebar open on top of the modal.
- **Emoji reaction picker rendered as a single stacked column** — the emoji picker popup's grid collapsed to a narrow column because its absolutely-positioned grid had no width, stacking all emojis on top of each other. Added a fixed width so the 8-column grid renders correctly.
- **Soft-deleting a message failed with an RLS error** — the messages UPDATE policy reused its `USING` expression as the `WITH CHECK` for the new row, so setting `is_deleted = true` was rejected with `42501`. Added a dedicated soft-delete policy and a `WITH CHECK` on the edit policy.
- **Scene messages couldn't be edited or deleted** — scene messages (GM-authored) were locked out of the edit/delete policies and rendered without edit/delete/reply controls. The GM can now edit and delete scene messages, and the scene message UI includes edit/delete/reply actions.
- **Advantage/disadvantage shorthand rolls failed** — the dice parser and linkifier required an explicit keep/drop count (`2d20kh1`), so `2d20kh+4` and `2d20kh` were rejected and not rendered as clickable dice. Keep/drop counts are now optional and default to 1 (`2d20kh+4`, `4d6dl`).
- **Unread message badge counted own + deleted messages** — the Lobby unread count now excludes the user's own messages and deleted messages.
- **Missing "new messages" marker** — opening a channel now shows a red "New messages" divider at the boundary since the member's `last_read_at`.
- **Chat messages no longer load** — removed the `messages_reply_to_fkey` PostgREST hint from the messages query. The hint caused every messages fetch to fail with `PGRST200` (relationship not in the PostgREST schema cache) after deployment, silently emptying all channels. With a single self-referencing FK on `messages`, the hint was unnecessary and is now dropped.
- **Silent error handling** — surfaced errors that were previously only logged and left the UI with stale/empty data:
  - Lobby now shows a banner when channels fail to load (`useChannels` exposes `error`).
  - Channel view shows a banner when messages fail to load (destructured `error` from `useMessages`).
  - Notification settings modal shows an error instead of stale toggles.
  - Auth session/profile fetch failures show an error screen instead of silently redirecting to login.
  - Archived channels list shows an error banner on fetch failure.
  - Roll history modal shows an error instead of "No dice rolls yet."
  - Push notification banner keeps itself visible and shows an error on failure instead of silently dismissing.
