# Features

## Users & Auth

- **Dark mode** — a sun/moon toggle in the app header (and login page) switches between light and dark themes. The choice persists per device; the default follows the OS light/dark preference (applied before first paint to avoid a flash)

- Google account sign-in
- Per-channel **character name** (max 20 characters) and **avatar**
- **Character modifiers** — per-game-system attribute modifier fields (e.g. STR/DEX); inputs accept integers only (floats/exponents/stray characters are rejected) and are clamped to the system's bounds
- **Character notes** — a plain-text notes field per player (backstory, reminders), shown in the member list
- Optional **character sheet URL** per user per channel
- **Server admin flag** (`profiles.server_admin`, managed via DB) — exempts the user from the channel limit; enforced to a single admin
- **Server Admin view** (`/admin`, via the "Server Admin" menu item, visible only to `server_admin`):
  - **Users tab** — display name, total active channels, joined date
  - **Channels tab** — name, game system, member count, created and last-active dates; orphaned channels (GM deleted their account) show an **Orphaned** badge with a **Claim** action that makes the admin the new GM
  - **Sortable tables** — click any Users/Channels column header to sort asc/desc (toggle on repeat click); tables scroll horizontally on mobile instead of cropping
  - **Settings tab** — edit **Maximum Channels per user** (minimum 10; persists in `app_settings`). Users already over a lowered limit keep their channels. Also configures **Image Uploads**: a master **allow image uploads** toggle (off by default to keep the server at near-zero cost), a **maximum image size** (1–50 MB), and an **auto-delete images older than (days)** retention (0 = keep forever; a daily `cleanup-images` edge function prunes older uploads).
- **Account & Data** (in Settings) — GDPR controls:
  - **Download My Data** — exports profile, channel memberships (with channel names), authored messages (including authored whispers), dice rolls, reactions, and notification preferences as a downloadable JSON file
  - **Delete Account** — permanent erasure. Confirmation requires typing `DELETE`. Deletes the account and personal data (auth record, profile, memberships, dice rolls, reactions, preferences, push subscriptions); past messages are kept **anonymized** and the user's GM channels are **orphaned** for server-admin reclaim. The sole server admin cannot delete their own account.
  - **Privacy Policy** link — `/privacy` page detailing Google OAuth scopes (`email`, `profile`), Supabase data storage, and access/erasure rights

## Channels & Lobby

- Any user can create a channel (becomes GM)
- **Channel limit** — non-server-admins are capped at **N active channels**, where N is the admin-configured `app_settings.max_channels_per_user` (default 10). Server-enforced in `join_channel`; the "Create Channel" button greys out at the cap with an explanatory toast. Existing members over a lowered limit are never kicked.
- **Lobby** lists only the private channels the user has joined
- **Lobby shows your role per channel** — a "GM" badge when you run the channel, a "Player" badge otherwise
- **Channel avatar** — GMs can upload an image avatar (WhatsApp/Signal-style) from Channel Settings; it shows in the channel list and the channel header. Images are downscaled client-side to ~512 px JPEG before upload into Supabase Storage, and uploads require the server admin to enable image uploads (off by default)
- **Image uploads (GM-only)** — when enabled, GMs can upload images into messages (inserted as markdown at the cursor), as the channel Map or Resources (Channel Settings), or as an NPC portrait. All uploads are downscaled client-side (JPEG) before hitting Supabase Storage, capped by the admin's size limit, and stored under `{channel_id}/{kind}/{uuid}.jpg`
- **Lobby sorts by most recent activity** (channels with recent messages first; channels with no messages last)
- **Lobby search** allows fuzzy finding channels by name
- Channels are **private** and joined via invite link
- Optional **password** to join (joining is instant)
- GM can **kick** (remove) or **block** a user (immediately revokes channel access, prevents re-entry, and can be undone via **Unblock**)
- **System messages** announce member joins, leaves, kicks, blocks, and unblocks in the channel
- **AFK / Away status** — any player can mark themselves away (with an optional away message like "Away until Monday"). Away members show an **AFK badge**, faded/grayscale avatar, and their away message in the member list; their name is struck through with an **(AFK)** tag in the active-player status bar. While away, **"It's your turn" push notifications are suppressed**.
- Optional **map URL** (external link)
- **Resources URL** (single URL — GDrive folder, PDF, etc.)
- **Export Chat** allows downloading the full message history to a Markdown file
- GM can **Archive** a channel, removing it from the main lobby (viewable/restorable via side menu)

## Channel Status (persistent, collapsible)

- **Free-form text** (markdown, emoji) — initiative order, timers, NPCs, etc.
- **Active player(s)** — structured field, one or more players, drives notifications
- Editable by GM at any time
- When collapsed, first line remains visible
- GM can set active player(s) while composing a message (updates status + notifies)

## Messages

- Text bubbles with sender identity (character name + avatar)
- Markdown and emoji support
- **Three message types**:
  - **Regular** — normal conversation
  - **Scene** — styled distinctly (scroll/parchment theme), acts as visual scene break. **GM-only**.
  - **NPC** — GM speaks as an NPC with name + portrait. **GM-only** (RLS-enforced). Parchment bubble style, distinct from both regular and scene messages.
- **Daily Dividers** — chat history is grouped by date visually
- **Editable** within 15 minutes, marked as "edited" (scene messages editable/deletable by the GM; NPC messages follow the 15-minute window)
- **Deletable** — replaced with "deleted" marker (soft-delete)
- URLs posted as plain text with external link, no previews or embeds
- **Reply/Quote** — any message can be replied to; replies render a quote of the original message and jump to it on click
- **Mentions** — `@CharacterName` autocompletes from channel members and renders as a highlight chip; mentioned users get a push notification. GMs can also use **`@all`** to mention every player at once. On desktop, arrow keys move the highlight through suggestions and Enter/Tab selects
- **Emoji reactions** — react to any message from a quick-emoji picker; counts update live and toggle per user
- **Unread badges** — Lobby shows a "N new" badge per channel counting messages since the member's `last_read_at`; excludes the user's own and deleted messages
- **New messages divider** — opening a channel marks it read and shows a red "New messages" divider at the first message since last read

## NPCs (GM-only)

- **NPC mode** under the composer "+" options — select, type a name, and the message is attributed to the NPC
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
- Roll result shows full breakdown for keep/drop rolls: `Rolled 2d20 with DIS [2, 15]: **2**`
- **Ability checks** (`STR Check`, `DEX Check`, etc.) — prompts for modifier, rolls d20; appending `with advantage` / `with disadvantage` rolls 2d20 keep-high (kh) / keep-low (kl) instead
- **DC checks** (`DC 12 DEX Check`) — same as ability checks, but the result message states **Success**/**Failure** and is styled green/red based on whether the roll (with modifier) meets the DC (meets beats); also supports `with advantage` / `with disadvantage`
- Rolls triggered from inline notation or check buttons in a message quote the source message (same "Replying to" block), so it's clear which request each roll answers
- **Dice Roller Panel**:
  - UI available to both GM and players
  - Pick dice type (d4, d6, d8, d10, d12, d20, d100)
  - Set quantity
  - Add modifier (+N / -N)
  - Advantage/disadvantage toggle (d20 only)
  - Roll button sends result as dice roll message
- Roll history available per channel

## Notifications

- **Push** — on by default
- **Server-side delivery** — push is triggered by a database trigger on new messages / active-player changes, so delivery no longer depends on the sender's browser being open or connected when they send
- **Subscription self-repair** — the app reconciles the server's copy of the push subscription on startup and whenever it returns to the foreground, and the service worker relays browser-initiated subscription rotation to the page so the stored endpoint/keys never go stale
- **Reliable delivery** — transient provider failures are retried with bounded backoff; only confirmed-invalid subscriptions (HTTP 404/410) are removed, and removing one device never affects another. Every delivery is logged to `push_delivery_log` (outcome, user, subscription, error category — never message content or push keys), and failed trigger dispatches can be re-queued via `retry_failed_push_invocations()`
- **In-app badge** — on by default
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

- Full-text search within a channel's message history

## Safety Tools (Lines & Veils / X-Card)

- **Lines & Veils** — GM-editable persistent text fields (collapsible "Safety Tools" section in Channel Settings) listing hard limits (Lines) and off-screen topics (Veils); visible to every member via the **Safety Tools** sidebar item
- **Safety Tools URL** — optional external link (e.g. a shared Google Doc), configured by the GM in settings and shown as a **Safety Tools Doc** menu item in the sidebar for all members (like the other URL fields)
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
