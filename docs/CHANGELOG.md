# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **Private channels only** — public channels are no longer supported. The lobby lists only the private channels the user has joined (no tabs), and joining a channel always happens through its invite link, with an optional password. The `is_public` column and its RLS policy/helper are removed.
- **PWA high-resolution icons** — added `public/manifest.json` plus 192×192 and 512×512 PNG icons so installing the app to a phone home screen shows a proper icon instead of a blank one.
- **Character name length limit** — channel character names are capped at 20 characters, enforced in the UI, by a DB CHECK constraint, and inside `join_channel` (existing values are truncated on migration).

### Fixed

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
