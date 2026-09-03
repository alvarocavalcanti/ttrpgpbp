# Features

## Users & Auth

- **Dark mode** — a sun/moon toggle in the app header (and login page) switches between light and dark themes. The choice persists per device; the default follows the OS light/dark preference (applied before first paint to avoid a flash)

- Google account sign-in
- **Display name** — up to 40 characters; optional character sheet links are limited to 500 characters
- **About** page — creator attribution, donation links, and GitHub project link
- Per-channel **character name** (max 20 characters) and **avatar**
- **Character modifiers** — per-game-system attribute modifier fields (e.g. STR/DEX) with −/+ stepper buttons (iOS has no signed numeric keypad, so stepping avoids the keyboard entirely); inputs accept integers only (floats/exponents/stray characters are rejected), start at 0, show the valid range in a subtitle, flag out-of-range values with a red border and block saving until corrected; legacy invalid stored values are reset to 0 when loaded
- **Character notes** — a plain-text notes field per player (backstory, reminders), shown in the member list
- Optional **character sheet URL** per user per channel
- **Server admin flag** (`profiles.server_admin`, managed via DB) — exempts the user from the channel limit; enforced to a single admin
- **Server Admin view** (`/admin`, via the "Server Admin" menu item, visible only to `server_admin`):
  - **Users tab** — display name, total active channels, joined date
  - **Channels tab** — name, game system, member count, created and last-active dates; orphaned channels (GM deleted their account) show an **Orphaned** badge with a **Claim** action that makes the admin the new GM
  - **Sortable tables** — click any Users/Channels column header to sort asc/desc (toggle on repeat click); tables scroll horizontally on mobile instead of cropping
  - **Settings tab** — edit **Maximum Channels per user** (minimum 10; persists in `app_settings`). Users already over a lowered limit keep their channels. Also configures **Image Uploads**: a master **allow image uploads** toggle (off by default to keep the server at near-zero cost), a **maximum image size** (1–50 MB), and an **auto-delete images older than (days)** retention (0 = keep forever; a daily `cleanup-images` edge function prunes older uploads).
- **Account & Data** (in Settings) — GDPR controls:
  - **Download My Data** — exports profile, channel memberships (with channel names and character notes), authored messages (including authored whispers), dice rolls, reactions, and notification preferences as a downloadable JSON file
  - **Delete Account** — permanent erasure. Confirmation requires typing `DELETE`. Deletes the account and personal data (auth record, profile, memberships, dice rolls, reactions, preferences, push subscriptions); past messages are kept **anonymized** and the user's GM channels are **orphaned** for server-admin reclaim. The sole server admin cannot delete their own account.
  - **Privacy Policy & Terms of Service** links — publicly accessible `/privacy` and `/terms` pages detailing Google OAuth scopes (`email`, `profile`), Supabase data storage, access/erasure rights, user content license, and disclaimers
- **Google Analytics** — optional anonymous page-view tracking via Google Analytics 4, enabled only when the `VITE_GA_MEASUREMENT_ID` build-time env var is set (self-hosted instances can leave it unset to disable analytics entirely). Only the page path is reported — search strings are stripped and never leave the device
- **Sentry** — optional error reporting enabled only when the `VITE_SENTRY_DSN` build-time env var is set: error reports, browser tracing (performance), and screen recordings of about 1 in 10 sessions (every session where an error occurs). See `docs/OBSERVABILITY.md` for setup

## Channels & Lobby

- Any user can create a channel (becomes GM)
- Channel names are limited to 80 characters
- **Channel limit** — non-server-admins are capped at **N active channels**, where N is the admin-configured `app_settings.max_channels_per_user` (default 10). Server-enforced in `join_channel`; the "Create Channel" button greys out at the cap with an explanatory toast. Existing members over a lowered limit are never kicked.
- **Lobby** lists only the private channels the user has joined
- **Lobby shows your role per channel** — a "GM" badge when you run the channel, a "Player" badge otherwise
- **Channel avatar** — GMs can upload an image avatar (WhatsApp/Signal-style) from Channel Settings; it shows in the channel list and the channel header. Images are downscaled client-side to ~512 px JPEG before upload into Supabase Storage, and uploads require the server admin to enable image uploads (off by default)
- **Image uploads (GM-only)** — when enabled, GMs can upload images into messages (inserted as markdown at the cursor), as the channel Map or Resources (Channel Settings), or as an NPC portrait. All uploads are downscaled client-side (JPEG) before hitting Supabase Storage, capped by the admin's size limit, and stored under `{channel_id}/{kind}/{uuid}.jpg`
- **Private image access** — the image bucket is private. Only members of a channel can view its images (enforced by storage policies and short-lived signed URLs), and the admin's enable/size limits are re-enforced server-side on every upload.
- **Lobby sorts by most recent activity** (channels with recent messages first; channels with no messages last)
- **Lobby search** allows fuzzy finding channels by name
- **App menu drawer** — the main app menu (Settings, Archived Channels, Help, etc.) slides in as a right-side drawer, opened from the header ☰ button or by swiping in from the right screen edge on touch devices; the channel sidebar supports the same edge swipe on mobile. Swiping back out (to the right) closes the open drawer or sidebar
- **Empty lobby onboarding** — with no channels joined, the lobby explains the invite-only model and offers both paths inline: a "Create a channel" button and a "Paste an invite link" field (paste a full invite URL to jump to the join screen, with a clear error for anything else)
- Channels are **private** and joined via invite link
- Optional **password** to join (joining is instant)
- GM can **kick** (remove) or **block** a user (immediately revokes channel access, prevents re-entry, and can be undone via **Unblock**)
- **System messages** announce member joins, leaves, kicks, blocks, and unblocks in the channel — each is written together with the member change in a single atomic step, so the announcement and the action can never fall out of sync
- **Archived channels** reject new messages, reactions, and joins server-side, not just in the UI
- **AFK / Away status** — any player can mark themselves away (with an optional away message up to 200 characters, like "Away until Monday"). Away members show an **AFK badge**, faded/grayscale avatar, and their away message in the member list; their name is struck through with an **(AFK)** tag in the active-player status bar. While away, **"It's your turn" push notifications are suppressed**.
- Optional **map URL** (external link, up to 500 characters)
- **Resources URL** (single URL — GDrive folder, PDF, etc.; up to 500 characters)
- **Export Chat** allows downloading the full message history to a Markdown file
- GM can **Archive** a channel, removing it from the main lobby (viewable/restorable via side menu)

## Channel Status (persistent, collapsible)

- **Free-form text** (markdown, emoji; up to 2,000 characters) — initiative order, timers, NPCs, etc.
- **Active player(s)** — structured field, one or more players, drives notifications
- Editable by GM at any time
- When collapsed, first line remains visible
- GM can set active player(s) directly from the channel menu (no message needed) or while composing a message (updates status + notifies)

## Messages

- Text bubbles with sender identity (character name + avatar)
- Markdown and emoji support
- **Three message types**:
  - **Regular** — normal conversation
  - **Scene** — styled distinctly (scroll/parchment theme), acts as visual scene break. **GM-only** (server-enforced).
  - **NPC** — GM speaks as an NPC with name + portrait. **GM-only** (server-enforced). The NPC's identity is validated against the channel's roster, so messages always carry a real roster portrait/name. Parchment bubble style, distinct from both regular and scene messages.
- **Narrative serif typography** — scene and NPC text renders in the **Crimson Pro** reading serif (self-hosted, offline-safe). An adjustable **Text size** preference (**Settings → Appearance**, Normal/Large/Extra large) scales the whole app's font, like a browser zoom, per device
- **Daily Dividers** — chat history is grouped by date visually
- **Scroll-to-top history loading** — scrolling near the top of an overflowing chat automatically loads older messages; short first pages keep a manual "Load older messages" button
- **Editable** within 15 minutes, marked as "edited" (scene messages editable/deletable by the GM; NPC messages follow the 15-minute window)
- **Deletable** — replaced with "deleted" marker (soft-delete). Deleting asks for confirmation inside the app (no browser popup)
- **In-app confirmations everywhere** — destructive actions (delete message, kick/block/leave channel, delete NPC, archive channel, delete admin thread/message) all confirm with a styled in-app dialog instead of the browser popup
- **Message actions** — reply/edit/delete/X-Card appear as hover icons on desktop; on mobile they collapse behind a single **"⋯"** button that opens a bottom sheet with large, easy-to-tap actions
- Messages are limited to 4,000 characters. URLs posted as plain text with external link, no previews or embeds
- **Reply/Quote** — any message can be replied to; replies render a quote of the original message and jump to it on click
- **Mentions** — `@CharacterName` autocompletes from channel members and renders as a highlight chip; mentioned users get a push notification. Mention targets are verified server-side against the channel's members, so a mention can never be routed to an outsider. GMs can also use **`@all`** to mention every player at once (authorized server-side, GM-only). On desktop, arrow keys move the highlight through suggestions and Enter/Tab selects
- **Draft persistence** — the composer saves text automatically per-channel. Closing the app or navigating away preserves the draft, which is only cleared after a message successfully sends
- **Reliable sending** — messages and rolls are sent with a client-generated idempotency key. If the connection drops during sending, the message is kept in a "Pending/Failed" state. Users can click **Retry** to safely resend it without duplicating the message, or **Remove** to discard the pending bubble (the draft text remains safe in the composer)
- **Emoji reactions** — react to any message from a quick-emoji picker; counts update live and toggle per user
- **Unread badges** — Lobby shows a "N new" badge per channel counting messages since the member's `last_read_at`; excludes the user's own and deleted messages
- **New messages divider** — opening a channel marks it read and shows a red "New messages" divider at the first message since last read

## NPCs (GM-only)

- **NPC mode** under the composer "+" options — select, type a name (up to 40 characters), and the message is attributed to the NPC
- **Create on the fly** — a new name creates the NPC automatically with a random game-icons.net portrait; an existing name reuses the existing portrait
- **Portrait picker** — search game-icons.net by name/tag and pick a specific icon (curated subset first, full search fallback)
- **Roster persisted per channel** (`channel_npcs`) — autocompletes existing NPC names; GMs can re-randomize or pick a portrait at any time
- **NPC management screen (GM-only)** — the channel sidebar's **NPCs** item opens the full roster: rename an NPC, change its portrait (game-icons.net picker, re-randomize, or upload an image), delete it, or add a new NPC directly. Deleting or renaming never changes past messages, which keep their own name/portrait snapshot
- NPC messages **snapshot** their name + portrait, so past messages stay stable if the NPC is later renamed/repictured
- NPC messages support **whispers** and appear in **search, chat export, and push notifications** attributed to the NPC
- Icons from game-icons.net (CC BY 3.0)

## Whispers

- Messages visible only to GM + one specific player
- Visible within the same channel timeline (but hidden from others)

## Dice

- Clickable dice notation in messages (GM writes them, players click)
- Each click generates a roll result message in the history
- **Supported notation (v1)**:
  - `NdX`, `NdX+M`, `NdX-M` (basics)
  - `2d20kh` / `2d20kl` (advantage/disadvantage, keep/drop count optional — defaults to 1, e.g. `2d20kh+4`)
  - `4d6dl` (drop lowest)
  - `kh`/`kl`/`dh`/`dl` with or without an explicit count
- **Roll result shows full breakdown for keep/drop rolls**: `Rolled 2d20 with DIS [2, 15]: **2**`
- **Critical rolls** — a d20 landing on a natural 20 displays **Critical Success**, and a natural 1 displays **Critical Failure** (based on the unmodified die, so modifiers don't change it). Applies to plain d20 rolls and to Advantage/Disadvantage (the kept die), and the roll history marks the same critical rolls.
- **Server-authoritative rolls** — every roll is evaluated and recorded server-side (result, individual dice, dropped dice, modifier) in a single atomic step together with the roll message. Modifiers are clamped to the game system's bounds, DC success/failure is computed server-side (meets beats), and no client can fabricate or edit a result. Rolls from soft-deleted messages are excluded from the roll history.
- **Ability checks** (`STR Check`, `DEX Check`, etc.) — opens a bottom sheet with the modifier pre-filled from your character profile (editable and constrained to the game system's bounds, with an Adv/Dis toggle); rolling a d20, or 2d20 keep-high (kh) / keep-low (kl) with `with advantage` / `with disadvantage` appended. If the modifier isn't set in your profile, the sheet links straight to Edit Character
- **DC checks** (`DC 12 DEX Check`) — same as ability checks, but the result message states **Success**/**Failure** and is styled green/red based on whether the roll (with modifier) meets the DC (meets beats); also supports `with advantage` / `with disadvantage`
- Rolls triggered from inline notation or check buttons in a message quote the source message (same "Replying to" block), so it's clear which request each roll answers
- **Dice Roller Panel**:
  - UI available to both GM and players
  - Pick dice type (d4, d6, d8, d10, d12, d20, d100)
  - Set quantity
  - Add modifier (+N / -N)
  - Advantage/disadvantage toggle (d20 only)
  - Quick-roll chips for the last 3 notations used in the channel — tap to re-roll
  - On phones the roller opens as a bottom sheet (no clipping) with +/− modifier steppers
  - Roll button sends result as dice roll message
- Roll history available per channel (header dice icon or sidebar item)

## Notifications

- **Push** — on by default
- **Server-side delivery** — push is triggered by a database trigger on new messages, active-player changes, and admin messages (announcements and server-admin DMs), so delivery no longer depends on the sender's browser being open or connected when they send
- **Subscription self-repair** — the app reconciles the server's copy of the push subscription on startup and whenever it returns to the foreground, and the service worker relays browser-initiated subscription rotation to the page so the stored endpoint/keys never go stale
- **Reliable delivery** — transient provider failures are retried with bounded backoff; only confirmed-invalid subscriptions (HTTP 404/410) are removed, and removing one device never affects another. Every delivery is logged to `push_delivery_log` (outcome, user, subscription, error category — never message content or push keys), and failed trigger dispatches can be re-queued via `retry_failed_push_invocations()`
- **In-app badge** — on by default
- **Realtime connection recovery** — the app shows when it is offline or reconnecting, keeps loaded chat usable, and catches up on messages (including edits and deletions), channel changes, rolls, and unread counts after returning
- **Offline navigation** — opening any app link while offline serves the cached app shell instead of a browser error page
- **Launcher icon badge** — when the PWA is installed, the home-screen icon shows the total unread count via the App Badging API (iOS 16.4+, desktop); respects the unread-badge preference and is updated in the background when a push arrives. A badge update failure never suppresses the system notification. Android has no badge API and shows a dot automatically only while a notification is active.
- **Email** — off by default
- Distinct notification for active player (e.g. "It's your turn")
- **Permission banner** — prompts to enable push notifications on first load
- **iOS support** — push requires installing the app to the Home Screen (iOS exposes the Push API only in installed PWAs); UI shows install guidance and disables push controls when unavailable
- **Per-channel settings** — each member controls which notifications they receive per channel:
  - All new messages
  - GM messages only
  - "It's your turn" alerts

## Search

- Full-text search within a channel's message history (header magnifier icon or sidebar item)

## Safety Tools (Lines & Veils / X-Card)

- **Lines & Veils** — GM-editable persistent text fields (up to 2,000 characters each; collapsible "Safety Tools" section in Channel Settings) listing hard limits (Lines) and off-screen topics (Veils); visible to every member via the **Safety Tools** sidebar item
- **Safety Tools URL** — optional external link (up to 500 characters; e.g. a shared Google Doc), configured by the GM in settings and shown as a **Safety Tools Doc** menu item in the sidebar for all members (like the other URL fields)
- **X-Card** — a red card-with-X button in the message composer and on each message flags a scene to the GM **anonymously** (no identity stored). The GM sees an instant in-app alert banner; the presser gets a private confirmation toast.

## Help

- **In-app help** — a **Help** menu item in the main app header opens a `/help` page with general topics; a **Help** item in the channel sidebar opens a channel-specific help modal
- Help content is authored as Markdown files in [docs/help/](docs/help/) (frontmatter: `title`, optional `screenshot`), rendered with react-markdown; adding/removing a topic is just adding/removing a `.md` file
- **Screenshots** live in `public/help/` and are referenced from frontmatter; the PWA precaches them
- AGENTS.md requires help content and screenshots to be updated alongside feature/UI changes

## Changelog

- **What's New modal** — on app load, if `CHANGELOG.md` has changed since the user last dismissed it, a **What's New** modal shows the 5 most recent changes
- **Dismissal** — "Dismiss" suppresses it until the next changelog update; "Don't show again" suppresses it forever (both stored per-device in localStorage). The modal can always be reopened via the **Change Log** menu item.
- **Full changelog** — the modal links to a `/changelog` page rendering the complete `docs/CHANGELOG.md`
