# Marketing copy

Ready-to-paste copy for the player & community promo push ([issue #648](https://github.com/alvarocavalcanti/ttrpgpbp/issues/648)).
Each file holds the exact title/body to post plus posting notes; the UTM-tagged
link in each one is what lets GA4 attribute the traffic back to its channel.

## Index

| File | Channel | Kind |
| --- | --- | --- |
| [`reddit-r-pbp-post.md`](./reddit-r-pbp-post.md) | r/pbp | Launch post — **shipped** |
| [`reddit-r-pbp-followup.md`](./reddit-r-pbp-followup.md) | r/pbp | One-week follow-up — **shipped** |
| [`reddit-r-shadowdark-post.md`](./reddit-r-shadowdark-post.md) | r/Shadowdark | System-framed post |
| [`reddit-r-osr-post.md`](./reddit-r-osr-post.md) | r/osr | System-framed post |
| [`giantitp-recruitment.md`](./giantitp-recruitment.md) | Giant in the Playground | LFM game ad |
| [`rpgnet-tavern.md`](./rpgnet-tavern.md) | RPG.net *Ye Olde Tavern* | LFM game ad |
| [`mastodon-intro.md`](./mastodon-intro.md) | dice.camp / tabletop.social | Account intro + dev updates |
| [`discord-admin-outreach.md`](./discord-admin-outreach.md) | Discord servers | Mod/admin DM |

## UTM convention

Every outbound link uses the same shape so a channel is readable in GA4's
reports:

```text
https://rolebypost.com/features?utm_source=<source>&utm_medium=<medium>&utm_campaign=<campaign>
```

`source` = where, `medium` = what kind of place (`social`, `forum`,
`community`), `campaign` = which post. The target is `/features` (the press
material is folded into it).

| Channel | Tracked link |
| --- | --- |
| r/Shadowdark | `https://rolebypost.com/features?utm_source=reddit&utm_medium=social&utm_campaign=r-shadowdark` |
| r/osr | `https://rolebypost.com/features?utm_source=reddit&utm_medium=social&utm_campaign=r-osr` |
| Giant in the Playground | `https://rolebypost.com/features?utm_source=giantitp&utm_medium=forum&utm_campaign=recruitment` |
| RPG.net | `https://rolebypost.com/features?utm_source=rpgnet&utm_medium=forum&utm_campaign=tavern` |
| Mastodon | `https://rolebypost.com/features?utm_source=mastodon&utm_medium=social&utm_campaign=dev-updates` |
| Discord | `https://rolebypost.com/features?utm_source=discord&utm_medium=community&utm_campaign=server-outreach` |

## Measurement (GA4)

- The app keeps `utm_*` parameters in the reported `page_location` and strips
  every other query parameter (so lobby search terms never leave the device).
  GA4 reads the campaign from there — no separate dashboard config needed, just
  use the tracked links above.
- Analytics is **consent-gated**: only visitors who opt in are counted, so the
  numbers will undercount the real traffic. Tracker blockers cause further
  undercounting. Treat the channel comparison as directional, not exact.
- Check GA4 → *Reports → Acquisition → Traffic acquisition* and group by
  *Session campaign* to compare channels.

## Before posting (pre-flight)

- [ ] **Reddit account history.** Reddit's self-promotion norm is roughly 9:1
      participation-to-promo (the "90/10 rule"). If the account has little
      history in a target sub, comment in a few threads first so posts don't hit
      automod filters.
- [ ] **Re-read each sub's live sidebar while logged in.** Rules and flairs
      change; the notes in each file were written from the general shape of the
      subs, not a frozen snapshot.
- [ ] **Back-to-back link spacing.** Don't post the same `/features` link more
      than once a week across subreddits.
- [ ] **Mastodon / Discord accounts exist** (creating them is manual) with the
      profile copy from `mastodon-intro.md`.
- [ ] **A game is ready** before posting the Giant in the Playground or RPG.net
      ads — those are recruitment posts, not tool posts.
- [ ] **Replies.** Answer questions within 24–48h and update each thread's
      title/OP when slots fill.

## Do not

- **Do not** post on competitor platforms as promotion targets: Myth-Weavers,
  Gamers Plane, Rolegate.
- **Do not** post in subreddits that ban app promotion: r/DnD, r/dndnext,
  r/DnDBehindTheScreen.
- **Do not** post r/rpg standalone — Rule 7 needs an active participant, and the
  account isn't one. The *Weekly Free Chat & Self-Promo* thread is the only
  opening there, if ever.
- **Do not** drop links cold in Discord servers; ask the mods first.

## Status notes

- The r/pbp one-week follow-up is shipped. It drove fewer players to the app
  than the original launch post — treat repeat waves as incremental, not a
  second launch.
- r/Shadowdark is considered fine to publish; r/osr is drafted alongside it.
