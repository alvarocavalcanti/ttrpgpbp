// Curated game-icons.net portraits (all verified against the Iconify API).
// game-icons.net is CC-BY 3.0 — attribution lives in the app footer/docs.
export const CURATED_NPC_ICONS = [
  'wizard-face', 'dragon-head', 'imp-laugh', 'ogre', 'skeleton', 'goblin-head',
  'troll', 'elf-helmet', 'centaur', 'minotaur', 'werewolf', 'vampire-dracula',
  'ghost', 'bandit', 'pirate-skull', 'frog', 'king', 'crown-coin', 'axe-in-stump',
  'cowled', 'hydra', 'mermaid', 'spy', 'snake', 'totem', 'winged-emblem',
  'death-skull', 'witch-flight', 'eyeball', 'goblin-camp', 'bone-knife',
  'knight-banner', 'emerald-necklace',
] as const

export function npcIconUrl(name: string): string {
  return `https://api.iconify.design/game-icons/${name}.svg`
}

export function randomNpcIconUrl(): string {
  return npcIconUrl(CURATED_NPC_ICONS[Math.floor(Math.random() * CURATED_NPC_ICONS.length)])
}
