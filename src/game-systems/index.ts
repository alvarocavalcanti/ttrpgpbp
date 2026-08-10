import shadowdark from './shadowdark.json'

export interface GameSystem {
  id: string
  name: string
  attributes: string[]
  minModifier?: number
  maxModifier?: number
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

export const DEFAULT_MODIFIER_LIMITS = { min: -4, max: 5 }

export function clampModifier(systemId: string | undefined, value: number): number {
  const system = systemId ? GAME_SYSTEMS[systemId] : undefined
  const min = system?.minModifier ?? DEFAULT_MODIFIER_LIMITS.min
  const max = system?.maxModifier ?? DEFAULT_MODIFIER_LIMITS.max
  return Math.min(Math.max(value, min), max)
}
