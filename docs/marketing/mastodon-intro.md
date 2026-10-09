# Mastodon intro

Copy for introducing Role by Post on a tabletop-friendly Mastodon instance
([dice.camp](https://dice.camp/) and
[tabletop.social](https://tabletop.social/) are the two obvious homes). Post
from the project account; keep the intro pinned and follow it with periodic dev
updates.

Tracked link (UTM): <https://rolebypost.com/features?utm_source=mastodon&utm_medium=social&utm_campaign=dev-updates>

## Profile

**Display name:** `Role by Post`

**Bio:**

```text
A free, text-first play-by-post app for tabletop RPGs. Not a VTT — a home for the writing, with dice, turn status, and safety tools built in. Built and maintained by one dev. #TTRPG #PbP
```

**Profile link / pinned post:** the tracked link above.

## Intro post

```text
Hello, Fediverse 👋

I'm building Role by Post — a free, text-first app for play-by-post RPGs. It isn't a VTT: no grid, no tokens. It's a place for the writing, with the table tools around it (clickable dice, a persistent status bar, NPC posts, safety tools, async notifications).

I made it because I was juggling sheets, dice, and turn notes across tabs for my own PbP games and wanted one place to play from my phone.

Free, no paid tier. Curious what you think, and open to what's missing.

https://rolebypost.com/features?utm_source=mastodon&utm_medium=social&utm_campaign=dev-updates

#TTRPG #PbP #OSR #Shadowdark
```

## Dev-update cadence

Short, regular posts rather than one big launch blast. Suggested rhythm:

- **Feature posts** — one shipped feature per post, with a screenshot. Mirror the player-friendly language in [docs/CHANGELOG.md](../CHANGELOG.md) (no internals).
- **Ask questions** — "what's missing from your PbP games?" invites boosts and replies, which is how an account gets discovered here.
- **Reuse the tracked link** on each post so GA4 can attribute sessions to Mastodon; vary nothing but keep `utm_campaign=dev-updates`.
- **Hashtags:** `#TTRPG #PbP`, plus the system when relevant (`#OSR`, `#Shadowdark`). Don't stack more than a few.
- **Alt text:** add it to every screenshot (community norm, and a real accessibility requirement).

## Posting notes

- **Instances:** dice.camp and tabletop.social both ask new accounts to read their local rules; a short, honest intro post within a day or two is the norm. If a server runs an introduction hashtag or thread, use it.
- **No cross-instance spam:** post once on the home instance; the Fediverse amplifies via boosts, not reposts.
- **Account setup is manual** (create the account, upload the avatar and header, verify the profile link); this doc only supplies the copy.
- **UTM:** use the tracked link so GA4 can attribute traffic to Mastodon (consent-gated, so expect undercounting).
