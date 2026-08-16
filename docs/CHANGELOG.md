# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **Push delivery hardening** — play-by-post games feel much smoother: push notifications now arrive reliably, even after a refresh or after the app sat in the background. Outdated subscriptions are cleaned up automatically, and a hiccup on one device never blocks notifications to the rest.
- **Dark mode** — a sun/moon toggle in the app header (and on the login page) switches the whole app between light and dark themes. Your choice is saved per device and follows your system theme by default.
- **NPC management screen (GM-only)** — the channel sidebar's **NPCs** item opens the full NPC roster. GMs can add an NPC, rename it, change its portrait, or delete it. Past messages keep the name and portrait they were posted with.
- **Image uploads everywhere (GM-only)** — GMs can upload images straight into a message, as the channel Map or Resources, or as an NPC portrait. A server setting can auto-delete old uploads after a set number of days to keep storage tidy.
- **Character notes** — a plain-text notes field per player, shown in the member list.
- **Channel avatar** — GMs can upload an image avatar for a channel from Channel Settings; it shows in the channel list and the channel header.
- **What's New changelog modal** — when new features ship, a **What's New** popup appears on app load showing the 5 most recent changes. Dismiss it until the next update, or forever; a **Change Log** menu item reopens it anytime, and a `/changelog` page shows the full history.
- **Deployment and contributing docs** — `DEPLOYMENT.md` walks through setting up your own instance (Supabase project, Google sign-in, push keys, migrations, and the static frontend), and `CONTRIBUTING.md` explains the project's philosophy and how to contribute.
- **MIT License** — the project is now MIT-licensed. You're free to self-host, modify, and even build paid services on it, as long as you keep attribution to the original project.
- **AFK / Away status** — any player can mark themselves away from the member-list menu, optionally with a message like "Away until Monday". Away players show an AFK badge and a faded avatar, and "It's your turn" push notifications pause while they're away.
- **Safety Tools: Lines & Veils** — a collapsible **Safety Tools (Lines & Veils)** section in GM Channel Settings holds persistent hard-limits (Lines) and off-screen topics (Veils). All members can view them via the new **Safety Tools** sidebar item.
- **Safety Tools URL** — an optional link (e.g. a shared Google Doc) configured by the GM in settings and surfaced to every member as a **Safety Tools Doc** menu item in the sidebar, matching the Map/Resources URL pattern.
- **Digital X-Card** — a card-with-X button on each message and in the composer lets any player privately flag a scene to the GM. The GM gets an instant in-app alert, and the player who pressed it gets a private confirmation. The flag is always anonymous.
- **Server admin view** — a "Server Admin" menu item opens an admin area with Users, Channels, and Settings tabs. The Settings tab lets the admin change the **Maximum Channels per user** value. Nobody is kicked if the limit is lowered; players keep their existing channels.
- **Admin-configurable channel cap** — the per-user channel limit is now a server setting (default 10) instead of hardcoded, and the whole app stays in sync with it.
- **GM/Player role badges in the lobby** — each channel in the lobby list now shows a "GM" badge when the user runs that channel and a "Player" badge otherwise.
- **NPC messages (GM-only)** — GMs can speak as NPCs with a name and portrait, straight from the composer's "+" options. NPC messages look distinct, respect the usual edit window, support whispers and replies, and show up in search and exports with the NPC's name. Reusing an NPC keeps its portrait.
- **Channel limit per user** — non-server-admins can join at most 10 active channels. The lobby "Create Channel" button greys out at the cap with a toast explaining why. A `server_admin` flag exempts admins from the limit.
- **System messages on member events** — a channel now posts a system message when a player joins, leaves, is kicked, or is blocked.
- **Private channels only** — public channels are no longer supported. The lobby lists only the private channels you've joined, and joining a channel always happens through its invite link, with an optional password.
- **PWA high-resolution icons** — installing the app to a phone home screen now shows a proper app icon instead of a blank one.
- **Character name length limit** — channel character names are capped at 20 characters.

### Fixed

- **Push notifications arriving late or not at all** — notifications can now show up reliably after the app refreshes or sits in the background. A failed badge update (e.g. on iOS) no longer blocks the notification itself.
- **X-Card alert never reached the GM** — the GM's alert when a player uses an X-Card sometimes never arrived. It now always shows, as a single dismissible banner that reads "Handle the scene outside the chat."
- **Mobile sidebar stayed open behind overlay modals** — opening Settings, Search, Rolls, or notification settings from the sidebar on mobile no longer leaves the slide-in sidebar open on top of the dialog.
- **Emoji reaction picker rendered as a single stacked column** — the emoji picker popup's grid no longer collapses into one narrow column; emojis now line up in a proper grid.
- **Soft-deleting a message failed with an error** — deleting a message could be rejected by the server. It now works reliably.
- **Scene messages couldn't be edited or deleted** — scene messages (GM-authored) couldn't be edited or deleted. The GM can now edit, delete, and reply to them like any other message.
- **Advantage/disadvantage shorthand rolls failed** — shorthand dice like `2d20kh+4` and `2d20kh` were rejected. Keep/drop counts are now optional and default to 1, so those rolls work and render as clickable dice.
- **Unread message badge counted own + deleted messages** — the Lobby unread count no longer includes your own messages or deleted ones.
- **Missing "new messages" marker** — opening a channel now shows a red "New messages" divider at the point you last read up to.
- **Chat messages no longer load** — a server-schema quirk could stop chat from loading after a deploy, silently emptying channels. Messages now load reliably.
- **Silent error handling** — things that used to fail silently now show a clear, friendly error message: the lobby, a channel view, notification settings, archived channels, the roll history, and the sign-in flow all surface problems instead of leaving you with stale or empty screens.
