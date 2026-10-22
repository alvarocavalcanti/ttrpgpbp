---
title: GM Tools
screenshot: /help-images/gm-settings.png
---

Everything the **GM** can do to run and manage a channel.

## Channel settings

Open **Settings** from the channel sidebar to configure:

- Channel name (up to 80 characters) and game system
- **Discovery** — list the channel so players can find it and apply (see below)
- **Channel avatar** — upload an image shown in the channel list and header (requires the server admin to enable image uploads)
- Map, resources, and GM resources URLs (up to 500 characters) — the Map and Resources fields also offer **Upload image** buttons that store the image instead of pasting an external link
- Safety Tools Doc URL (up to 500 characters) and Lines & Veils (up to 2,000 characters each)

## Managing members

- **Kick** a user — removes them from the channel
- **Block** a user — prevents them from returning or interacting

## Managing NPCs

The **NPCs** sidebar item opens the NPC roster for the channel. From there the GM can:

- **Rename** an NPC — past messages keep their original name snapshot
- **Re-picture** an NPC — pick a game-icons.net portrait, re-randomize, or upload an image
- **Delete** an NPC — removes it from the roster; past messages keep their portrait snapshot
- **Add** a new NPC directly, with a chosen or random portrait

## Rooms

The **Rooms** sidebar item opens the room manager. From there the GM can create, rename, archive, restore, and delete rooms, choose who can see each one (**Everyone**, **Only the GM**, or **Invited players**), and turn dice, Scenes, NPC posts, and whispers on or off per room — either while creating the room or on one that already exists. A channel holds up to 10 active rooms. See [Rooms](/help/rooms) for the full guide.

## Setting active players

The **Active Player** sidebar item opens a list of the channel's players. Check one or more to name who is up next, then **Save** — the change applies immediately (no message needed) and sends the active player(s) an "It's your turn" notification. Leaving all boxes unchecked clears the active player.

Shortcut: open a player's **⋯** menu in the member list and choose **Set as Active Player** to make that player the active one right away (this replaces whoever is active now; use the modal to set several at once).

## Archiving

The GM can **archive** a channel, removing it from the main lobby. Archived channels are still viewable and restorable from the **Archived Channels** item in the app menu.

## Listing your game for new players

Channel **Settings** has a **Discovery** section. A channel is either:

- **Private — invite link only** (the default), or
- **Listed — apply to join**, which puts it in the lobby's **Discover** tab and on the public [/directory](/directory) page, where anyone can read its description.

To list a game you must write a **Description** (what the game is about) and **What you expect** (posting pace, tone, safety expectations) — both up to 600 characters — and you can add an optional **application prompt** (up to 300 characters), the question applicants answer.

Listing a channel is public: the description and what you expect are shown to anyone, and search engines can index them. Messages and player details never are. Once a channel is listed, players apply and you decide.

### Sharing your game

A listed channel has a **public game link** you can post anywhere — Reddit, a forum, Discord. Copy it from the **Public game link** field in **Channel Settings → Discovery**, or with **Copy public link** on the listing itself. Anyone who opens it, signed in or not, reads the game's name, system, description, what you expect, and your application question, plus who runs it; a signed-out visitor is invited to sign in and apply, and a signed-in player gets the usual **Apply to join** form. Messages and player details never appear on it, and the page is not search-engine indexed — the [/directory](/directory) page is the public, searchable list. If you switch back to **Private** or a server admin takes the listing down, the link stops working and shows a plain "this game isn't listed" page.

Web links you paste into the description or what you expect become tappable wherever the listing appears — players can open them in a new tab. Use full addresses (`https://example.com` or `www.example.com`); plain words are left alone.

## Join requests

Below the Discovery section, **Join requests (N)** lists everyone waiting on you — their character name, their answer, and when they applied. **Approve** adds them as a member straight away (the name they gave becomes their character name) and **Reject** closes the application; either way they're notified. There's a count badge on the channel's **Settings** button and on the channel's row in the lobby, so a new application is visible without opening the channel.

Applications are one at a time: a player can't apply twice while a decision is pending, and the same applicant can't be approved twice.

## Removing a listing

Switch back to **Private** to remove a listing. That closes any applications still open, and the game disappears from Discover and [/directory](/directory) — existing members keep playing normally. A server admin can also remove a listing; you can't re-list until they restore it.

## Invites & privacy

A **private** channel is joined via **invite link**, with an optional **password**. A **listed** channel is joined by GM approval instead — no invite or password needed, and every application is vetted by you. Either way, messages and player details stay inside the channel.

Uploaded images (message images, channel avatars, NPC portraits, and map/resource uploads) are also private: only people in the channel can view them, and a player who is kicked or blocked loses access. The server admin's image-upload setting and size limit apply to every upload.

## Messages

- GMs can post **Scene** and **NPC** messages
- **Upload images** — with image uploads enabled, the GM composer has an **Upload** button (in the "+" options) that uploads an image and inserts it into the message at the cursor; on a desktop you can also drag one or more image files straight onto the message box
- **Channel Media** — the sidebar's **Channel Media** item (available to everyone) lists every image shared in the channel. Anyone can open one fullscreen; the GM can pick several and insert them into a message at the cursor
- **Tap an image to zoom** — any image in a message opens fullscreen: pinch or use the +/− buttons to zoom, scroll or trackpad-pan while zoomed, and double-tap (or double-click) to fit it back on screen. Close with ✕ or Escape. If an image can't be loaded you'll see a short message and a **Retry** button instead
- **Images hold their place** — a shared image reserves its spot in the conversation before it appears, so the chat doesn't jump around as pictures load in
- Send **whispers** to a single player, visible only to them
- Scene messages can be edited or deleted at any time by the GM
