import shadowdark from './shadowdark.json'

export interface GameSystem {
  id: string
  name: string
  attributes: string[]
  minModifier?: number
  maxModifier?: number
  sectionTitle?: string
  sectionSubTitle?: string
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

// Attribute-modifier inputs accept integers only: an optional leading minus
// followed by digits. Floats, exponents, and stray characters are rejected so
// the field can never hold a non-numerical value (UX#170).
export function isValidModifierInput(value: string): boolean {
  return /^-?\d*$/.test(value)
}

export function getModifierLimits(systemId: string | undefined): { min: number; max: number } {
  const system = systemId ? GAME_SYSTEMS[systemId] : undefined
  return {
    min: system?.minModifier ?? DEFAULT_MODIFIER_LIMITS.min,
    max: system?.maxModifier ?? DEFAULT_MODIFIER_LIMITS.max,
  }
}

// Section copy for the modifier inputs, interpolating the system's limits into
// its subtitle template ("... range from {min} to {max}"). Falls back to a
// generic subtitle when the system doesn't define one.
export function getModifierSectionCopy(systemId: string | undefined): { title?: string; subTitle: string } {
  const system = systemId ? GAME_SYSTEMS[systemId] : undefined
  const { min, max } = getModifierLimits(systemId)
  const subTitle =
    system?.sectionSubTitle?.replace('{min}', String(min)).replace('{max}', String(max)) ??
    `Modifiers range from ${min} to ${max}`
  return { title: system?.sectionTitle, subTitle }
}

// Sanitize a stored/loaded attribute value into a display string: integers are
// clamped to the system's bounds, anything else (legacy floats, exponent
// notation, garbage) resets to '0' (UX#350).
export function sanitizeModifierValue(systemId: string | undefined, value: unknown): string {
  const raw = value == null ? '' : String(value)
  return /^-?\d+$/.test(raw) ? String(clampModifier(systemId, parseInt(raw, 10))) : '0'
}
