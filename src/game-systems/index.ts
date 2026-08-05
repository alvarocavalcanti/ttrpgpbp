import shadowdark from './shadowdark.json'

export interface GameSystem {
  id: string
  name: string
  attributes: string[]
}

export const GAME_SYSTEMS: Record<string, GameSystem> = {
  [shadowdark.id]: shadowdark,
}

export const GAME_SYSTEM_OPTIONS = [
  { id: 'none', name: 'None (Generic)' },
  ...Object.values(GAME_SYSTEMS)
]

export function getSystemAttributes(systemId: string | undefined): string[] {
  if (!systemId || systemId === 'none') return []
  return GAME_SYSTEMS[systemId]?.attributes || []
}
