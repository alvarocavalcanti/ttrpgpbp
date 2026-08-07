# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Fixed

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
