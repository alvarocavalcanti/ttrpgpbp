const DICE_REGEX = /\b(\d+d\d+(?:(?:kh|kl|dh|dl)\d*)?(?:>=\d+)?p?(?:[+-]\d+)?)\b/gi

export type DiceRollMode = 'sum' | 'pool' | 'successes'

export interface ParsedDiceNotation {
  count: number
  sides: number
  keepDrop: string
  mode: DiceRollMode
  target: number | null
  modifier: number
}

// Single client-side source for the dice grammar (mirrors
// parse_dice_notation in the dice_pool_support migration): structural parse
// plus the pool exclusivity rules. Sum acceptance is unchanged — everything
// the old exact-match regex accepted still parses.
export function parseDiceNotation(notation: string): ParsedDiceNotation | null {
  const norm = notation.replace(/\s+/g, '').toLowerCase()
  const match = norm.match(/^(\d{1,3})d(\d{1,3})((?:kh|kl|dh|dl)\d{0,3})?(?:(>=)(\d{1,3}))?(p)?(?:([+-])(\d{1,4}))?$/)
  if (!match) return null
  const keepDrop = match[3] || ''
  const hasTarget = match[4] !== undefined
  const hasPoolFlag = match[6] !== undefined
  const mode: DiceRollMode = hasTarget ? 'successes' : hasPoolFlag ? 'pool' : 'sum'
  const count = Number(match[1])
  const sides = Number(match[2])
  const modifier = match[8] ? (match[7] === '-' ? -1 : 1) * Number(match[8]) : 0
  // Pool modes carry no keep/drop, no modifier, and never combine.
  if (mode !== 'sum' && (keepDrop !== '' || modifier !== 0)) return null
  if (hasTarget && hasPoolFlag) return null
  let target: number | null = null
  if (mode === 'successes') {
    target = Number(match[5])
    // The target must be a reachable face (mirrors the server).
    if (target < 1 || target > sides) return null
  }
  return { count, sides, keepDrop, mode, target, modifier }
}

export function isValidDiceNotation(notation: string): boolean {
  return parseDiceNotation(notation) !== null
}

// Fallback attribute set for channels with no game system (none/generic).
const GENERIC_CHECK_ATTRIBUTES = [
  'STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA',
  'Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma',
]

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Builds the ability-check matcher from the game system's attribute list.
// Recognizes `DEX Check`, `DC 12 DEX Check`, and an optional trailing
// `with advantage|disadvantage`; the DC and adv/dis are captured for roll
// evaluation at click time.
function checkRegex(attributes: string[]): RegExp {
  const attrs = attributes.length > 0 ? attributes : GENERIC_CHECK_ATTRIBUTES
  const alt = attrs.map(escapeRegex).join('|')
  return new RegExp(`\\b(?:DC\\s+(\\d+)\\s+)?(${alt})\\s+Check(?:\\s+with\\s+(advantage|disadvantage))?\\b`, 'gi')
}

// Preprocesses text to turn dice notations into markdown links, skipping code blocks
export function linkifyDice(text: string, attributes?: string[]): string {
  if (!text) return text
  const parts = text.split(/(```[\s\S]*?```|`[^`]*`)/g)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { // outside code blocks
      parts[i] = parts[i]
        .replace(DICE_REGEX, '[$1](dice:$1)')
        .replace(checkRegex(attributes || []), (_match, dc, ability, advDis) => {
          const advLabel = advDis ? ` with ${advDis}` : ''
          const advCode = advDis ? `:${advDis.toLowerCase() === 'advantage' ? 'adv' : 'dis'}` : ''
          return `[${ability} Check${dc ? ` (DC ${dc})` : ''}${advLabel}](check:${ability}${dc ? `:${dc}` : ''}${advCode})`
        })
    }
  }
  return parts.join('')
}
