# Features

## Users & Auth
- Google account sign-in
- Per-channel **character name** and **avatar**
- Optional **character sheet URL** per user per channel

## Channels
- Any user can create a channel (becomes GM)
- **Public** (listed in a lobby) or **invite link**
- Optional **password** to join (joining is instant)
- GM can revoke access or **block** a user
- Optional **map URL** (external link)
- **Resources URL** (single URL — GDrive folder, PDF, etc.)

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
- **Editable** within 15 minutes, marked as "edited"
- **Deletable** — replaced with "deleted" marker
- URLs posted as plain text with external link, no previews or embeds

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

## Search
- Full-text search within a channel's message history
