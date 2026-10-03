// Dice grammar, mirrored by parse_dice_notation on the server.
//
// A sum roll may chain several dice groups (`2d6+1d8+3`): every group is
// rolled and kept/dropped independently, then all kept faces are summed with
// one trailing modifier. Pool and success rolls stay a single group, since
// their faces are read rather than summed.

export type DiceRollMode = 'sum' | 'pool' | 'successes'

export interface DiceGroup {
  count: number
  sides: number
  keepDrop: string
}

export interface ParsedDiceNotation {
  count: number
  sides: number
  keepDrop: string
  groups: DiceGroup[]
  mode: DiceRollMode
  target: number | null
  modifier: number
  sorted: boolean
}

// One `NdM` group with an optional keep/drop suffix.
const GROUP_RE = /^(\d{1,3})d(\d{1,3})((?:kh|kl|dh|dl)\d{0,3})?$/
// A single group plus the pool/success/sort/modifier grammar. Everything the
// old exact-match regex accepted still parses here.
const SINGLE_RE = /^(\d{1,3})d(\d{1,3})((?:kh|kl|dh|dl)\d{0,3})?(?:(>=)(\d{1,3}))?(p)?(s)?(?:([+-])(\d{1,4}))?$/

export function parseDiceNotation(notation: string): ParsedDiceNotation | null {
  const norm = notation.replace(/\s+/g, '').toLowerCase()
  const single = norm.match(SINGLE_RE)
  if (single) return parseSingle(single)
  return parseSumChain(norm)
}

function parseSingle(match: RegExpMatchArray): ParsedDiceNotation | null {
  const keepDrop = match[3] || ''
  const hasTarget = match[4] !== undefined
  const hasPoolFlag = match[6] !== undefined
  const hasSortFlag = match[7] !== undefined
  const mode: DiceRollMode = hasTarget ? 'successes' : hasPoolFlag ? 'pool' : 'sum'
  const count = Number(match[1])
  const sides = Number(match[2])
  const modifier = match[9] ? (match[8] === '-' ? -1 : 1) * Number(match[9]) : 0
  // Pool modes carry no keep/drop, no modifier, and never combine.
  if (mode !== 'sum' && (keepDrop !== '' || modifier !== 0)) return null
  if (hasTarget && hasPoolFlag) return null
  // Sorting is a pool-modes display flag: bare sums never sort.
  if (hasSortFlag && mode === 'sum') return null
  let target: number | null = null
  if (mode === 'successes') {
    target = Number(match[5])
    // The target must be a reachable face (mirrors the server).
    if (target < 1 || target > sides) return null
  }
  const groups: DiceGroup[] = [{ count, sides, keepDrop }]
  return { count, sides, keepDrop, groups, mode, target, modifier, sorted: hasSortFlag }
}

// Chained sum: `group(+group)*` with an optional single trailing modifier.
// Dice are only ever added, so `-` between groups is rejected.
function parseSumChain(norm: string): ParsedDiceNotation | null {
  let body = norm
  let modifier = 0
  const mod = body.match(/([+-])(\d{1,4})$/)
  // A trailing `+1d8` is another group, not a modifier: only treat it as a
  // modifier when the character before the sign is not a `d`.
  if (mod && mod.index !== undefined && body[mod.index - 1] !== 'd') {
    modifier = (mod[1] === '-' ? -1 : 1) * Number(mod[2])
    body = body.slice(0, mod.index)
  }
  if (!body.includes('d')) return null

  const groups: DiceGroup[] = []
  for (const part of body.split('+')) {
    const group = part.match(GROUP_RE)
    if (!group) return null
    groups.push({ count: Number(group[1]), sides: Number(group[2]), keepDrop: group[3] || '' })
  }
  if (groups.length < 1) return null

  return {
    count: groups[0].count,
    sides: groups[0].sides,
    keepDrop: groups[0].keepDrop,
    groups,
    mode: 'sum',
    target: null,
    modifier,
    sorted: false,
  }
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

// Maximal dice token: one die, then either a pool/success suffix or a chain of
// `+die` groups, then an optional modifier. Greedy, so a chained notation is
// linked as a single token rather than split into separate dice buttons.
const DIE_PART = String.raw`\d{1,3}d\d{1,3}(?:(?:kh|kl|dh|dl)\d{0,3})?`
const POOL_PART = String.raw`(?:>=\d{1,3}s?|p(?:s)?)`
const DICE_REGEX = new RegExp(String.raw`\b(${DIE_PART}(?:${POOL_PART}|(?:\+${DIE_PART})*(?:[+-]\d{1,4})?))\b`, 'gi')

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
