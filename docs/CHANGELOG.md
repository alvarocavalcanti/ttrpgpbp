# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **Character notes in your data export** — the "Download My Data" file now includes the character notes you saved on each channel, so everything you wrote down comes out with the rest of your data.
- **Security hardening** — players can no longer change who the active player is or suspend accounts unless they hold the right role, and channels without a Game Master are protected from edits. These protections keep every table fair.
- **Standalone active-player control (GM-only)** — the channel sidebar's new **Active Player** item opens a list of the channel's players. Check one or more to name who is up next and save — no message needed — and the active player gets an "It's your turn" notification. The composer also shows a small chip for each active option (Scene, NPC, Whisper, Active Player) once the options panel is closed, so it's clear what's queued.
- **Anonymous usage analytics** — the app now sends basic, anonymous page-view statistics to help the team understand which parts of the app are used. No personal data, messages, or rolls are ever tracked.

- **Server Admin & GM communication** — active Game Masters now have a dedicated "Admin Messages" menu item to report issues, ask questions, and read announcements from the server admin. The admin can broadcast announcements and start direct messages with any GM, with push notifications to keep everyone in the loop.

- **Drafts and reliable sending** — the composer now saves your draft automatically as you type. If you close the app or switch channels mid-sentence, your text is there when you return. Messages and rolls also send more reliably: if your connection drops while sending, the message shows as "Pending" and then gives you "Retry" and "Remove" options when the failure is confirmed, keeping your text safe. Retries are guaranteed not to duplicate the message.
- **About page and creator support** — the app now credits its creator, links to the RoleByPost project, and provides donation badges for anyone who wants to support development.
- **Trustworthy dice rolls** — every roll is now generated and recorded on the server: the result, the individual dice, dropped dice, and any modifier are saved together with the roll message in a single step. Everyone at the table sees the same outcome, nothing can be tampered with, and modifier limits from the game system always apply. Roll history also drops rolls that came from deleted messages.
- **Push delivery hardening** — play-by-post games feel much smoother: push notifications now arrive reliably, even after a refresh or after the app sat in the background. Outdated subscriptions are cleaned up automatically, and a hiccup on one device never blocks notifications to the rest.
- **Dark mode** — a sun/moon toggle in the app header (and on the login page) switches the whole app between light and dark themes. Your choice is saved per device and follows your system theme by default.
- **NPC management screen (GM-only)** — the channel sidebar's **NPCs** item opens the full NPC roster. GMs can add an NPC, rename it, change its portrait, or delete it. Past messages keep the name and portrait they were posted with.
- **Image uploads everywhere (GM-only)** — GMs can upload images straight into a message, as the channel Map or Resources, or as an NPC portrait. A server setting can auto-delete old uploads after a set number of days to keep storage tidy.
- **Character notes** — a plain-text notes field per player, shown in the member list.
- **Channel avatar** — GMs can upload an image avatar for a channel from Channel Settings; it shows in the channel list and the channel header.
- **What's New changelog modal** — when new features ship, a **What's New** popup appears on app load showing the 5 most recent changes. Dismiss it until the next update, or forever; a **Change Log** menu item reopens it anytime, and a `/changelog` page shows the full history.
- **MIT License** — the project is now MIT-licensed. You're free to self-host, modify, and even build paid services on it, as long as you keep attribution to the original project.
- **AFK / Away status** — any player can mark themselves away from the member-list menu, optionally with a message like "Away until Monday". Away players show an AFK badge and a faded avatar, and "It's your turn" push notifications pause while they're away.
- **Safety Tools: Lines & Veils** — a collapsible **Safety Tools (Lines & Veils)** section in GM Channel Settings holds persistent hard-limits (Lines) and off-screen topics (Veils). All members can view them via the new **Safety Tools** sidebar item.
- **Safety Tools URL** — an optional link (e.g. a shared Google Doc) configured by the GM in settings and surfaced to every member as a **Safety Tools Doc** menu item in the sidebar, matching the Map/Resources URL pattern.
- **Digital X-Card** — a card-with-X button on each message and in the composer lets any player privately flag a scene to the GM. The GM gets an instant in-app alert, and the player who pressed it gets a private confirmation. The flag is always anonymous.
- **Server admin view** — a "Server Admin" menu item opens an admin area with Users, Channels, and Settings tabs. The Settings tab lets the admin change the **Maximum Channels per user** value. Nobody is kicked if the limit is lowered; players keep their existing channels.
- **Admin-configurable channel cap** — the per-user channel limit is now a server setting (default 10), and the whole app stays in sync with it.
- **GM/Player role badges in the lobby** — each channel in the lobby list now shows a "GM" badge when the user runs that channel and a "Player" badge otherwise.
- **NPC messages (GM-only)** — GMs can speak as NPCs with a name and portrait, straight from the composer's "+" options. NPC messages look distinct, respect the usual edit window, support whispers and replies, and show up in search and exports with the NPC's name. Reusing an NPC keeps its portrait.
- **Channel limit per user** — non-server-admins can join at most 10 active channels. The lobby "Create Channel" button greys out at the cap with a toast explaining why. Server admins are exempt from the limit.
- **System messages on member events** — a channel now posts a system message when a player joins, leaves, is kicked, or is blocked.
- **Private channels only** — public channels are no longer supported. The lobby lists only the private channels you've joined, and joining a channel always happens through its invite link, with an optional password.
- **Phone home-screen app icon** — installing the app to a phone home screen now shows a proper app icon instead of a blank one.
- **Character name length limit** — channel character names are capped at 20 characters.

### Fixed

- **Images in private channels stay private** — images you upload (in a message, as a channel avatar, an NPC portrait, or a map) can now only be seen by people in that channel. Someone who isn't a member, or who is later removed from the channel, can no longer view them. The admin's upload settings (allowed / max size) are also enforced on the server, so they hold no matter how an upload is made.
- **Dark mode polish** — every screen now reads correctly in dark mode: text you type in editors and input fields stays visible, help pages and search results render cleanly, and the browser toolbar matches your theme.
- **Push notifications arriving late or not at all** — notifications can now show up reliably after the app refreshes or sits in the background. A failed badge update (e.g. on iOS) no longer blocks the notification itself.
- **X-Card alert never reached the GM** — the GM's alert when a player uses an X-Card sometimes never arrived. It now always shows, as a single dismissible banner that reads "Handle the scene outside the chat."
- **Mobile sidebar stayed open behind overlay modals** — opening Settings, Search, Rolls, or notification settings from the sidebar on mobile no longer leaves the slide-in sidebar open on top of the dialog.
- **Emoji reaction picker rendered as a single stacked column** — the emoji picker popup's grid no longer collapses into one narrow column; emojis now line up in a proper grid.
- **Soft-deleting a message failed with an error** — deleting a message could be rejected by the server. It now works reliably.
- **Scene messages couldn't be edited or deleted** — scene messages (GM-authored) couldn't be edited or deleted. The GM can now edit, delete, and reply to them like any other message.
- **Advantage/disadvantage shorthand rolls failed** — shorthand dice like `2d20kh+4` and `2d20kh` were rejected. Keep/drop counts are now optional and default to 1, so those rolls work and render as clickable dice.
- **Unread message badge counted own + deleted messages** — the Lobby unread count no longer includes your own messages or deleted ones.
- **Missing "new messages" marker** — opening a channel now shows a red "New messages" divider at the point you last read up to.
- **Channel view didn't reliably scroll to your unread messages** — a channel with a lot of history could leave the view pinned partway while images finished loading, and returning to the app after it sat in the background often dropped your place. Opening a channel now consistently takes you to your oldest unread message (or the latest one when you're caught up), and coming back to the app after a pause restores that same spot instead of leaving you stranded.
- **Chat messages no longer load** — a behind-the-scenes server change could stop chat from loading, silently emptying channels. Messages now load reliably.
- **Silent error handling** — things that used to fail silently now show a clear, friendly error message: the lobby, a channel view, notification settings, archived channels, the roll history, and the sign-in flow all surface problems instead of leaving you with stale or empty screens.
