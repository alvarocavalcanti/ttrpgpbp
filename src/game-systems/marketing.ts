// Public landing-page copy for the supported game systems (issue #645). Kept
// free of React and imports so it can be imported by the page and (via
// scripts/seo) by any pure module. SEO titles/descriptions live in
// PUBLIC_ROUTES, the single source of truth for the prerender.
//
// Only systems with genuinely useful copy get an entry — do not add a page for
// a system until there is something worth reading.
export interface GameSystemPageCopy {
  slug: string
  heading: string
  intro: string
  sections: { heading: string; body: string[] }[]
  exampleRolls: { notation: string; label: string }[]
}

export const GAME_SYSTEM_COPY: Record<string, GameSystemPageCopy> = {
  shadowdark: {
    slug: 'shadowdark',
    heading: 'Play Shadowdark by Post',
    intro:
      'Shadowdark is a rules-light, old-school fantasy RPG built around d20 checks and six classic stats. Role by Post gives a Shadowdark table an asynchronous home: character stats, clickable dice, and one shared timeline you can play from any device.',
    sections: [
      {
        heading: 'Shadowdark stats in Role by Post',
        body: [
          'Each character stores the six Shadowdark attributes — Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma — as modifier fields.',
          'Modifiers are clamped to the range Shadowdark uses, so a value can never drift out of bounds, and they persist between sessions for every player at the table.',
        ],
      },
      {
        heading: 'Dice and checks',
        body: [
          'Roll straight from the channel: type a notation like 1d20+3 and it becomes tappable, or open an ability check and the stat modifier is filled in for you.',
          'Advantage and disadvantage roll 2d20 and keep the higher or lower die, with the full breakdown shown in the timeline.',
        ],
      },
      {
        heading: 'Playing asynchronously',
        body: [
          'Shadowdark plays fast at a table, and by post it fits busy schedules: players post when they can, and turn alerts plus away status keep the party moving without anyone needing to be online at the same time.',
          'Every channel includes lines and veils and an anonymous X-card, so a table can handle uncomfortable moments without derailing the story.',
        ],
      },
    ],
    exampleRolls: [
      { notation: '1d20+2', label: 'A Strength check' },
      { notation: '2d20kh1', label: 'A check with advantage' },
      { notation: '1d6', label: 'Weapon damage' },
      { notation: '4d6dl1', label: 'Roll stats, drop the lowest' },
    ],
  },
}
