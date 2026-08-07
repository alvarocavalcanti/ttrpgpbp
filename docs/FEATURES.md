# Features

## Users & Auth
- Google account sign-in
- Per-channel **character name** and **avatar**
- Optional **character sheet URL** per user per channel

## Channels & Lobby
- Any user can create a channel (becomes GM)
- **Lobby** displays joined and public channels via tabs
- **Lobby sorts by most recent activity** (channels with recent messages first; channels with no messages last)
- **Lobby search** allows fuzzy finding channels by name
- Channels can be **Public** (listed in lobby) or private (invite link)
- Optional **password** to join (joining is instant)
- GM can **kick** (remove) or **block** a user (prevent return/interaction)
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
- **Two message types**:
  - **Regular** — normal conversation
  - **Scene** — styled distinctly (scroll/parchment theme), acts as visual scene break. **GM-only**.
- **Daily Dividers** — chat history is grouped by date visually
- **Editable** within 15 minutes, marked as "edited"
- **Deletable** — replaced with "deleted" marker
- URLs posted as plain text with external link, no previews or embeds
- **Reply/Quote** — any message can be replied to; replies render a quote of the original message and jump to it on click
- **Mentions** — `@CharacterName` autocompletes from channel members and renders as a highlight chip; mentioned users get a push notification
- **Emoji reactions** — react to any message from a quick-emoji picker; counts update live and toggle per user

## Whispers
- Messages visible only to GM + one specific player
- Visible within the same channel timeline (but hidden from others)

## Dice
- Clickable dice notation in messages (GM writes them, players click)
- Each click generates a roll result message in the history
- **Supported notation (v1)**:
  - `NdX`, `NdX+M`, `NdX-M` (basics)
  - `2d20kh1` / `2d20kl1` (advantage/disadvantage)
  - `4d6dl1` (drop lowest)
- Roll result shows full breakdown: `2d20kh1: **18**: [18, 7]`
- **Ability checks** (`STR Check`, `DEX Check`, etc.) — prompts for modifier, rolls d20
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
- **In-app badge** — on by default
- **Email** — off by default
- Distinct notification for active player (e.g. "It's your turn")
- **Permission banner** — prompts to enable push notifications on first load
- **Per-channel settings** — each member controls which notifications they receive per channel:
  - All new messages
  - GM messages only
  - "It's your turn" alerts

## Search
- Full-text search within a channel's message history
