const DICE_REGEX = /\b(\d+d\d+(?:(?:kh|kl|dh|dl)\d*)?(?:[+-]\d+)?)\b/gi

// Exact-match dice notation (`3d6kh1+2`, `2d20kh`, `4d6dl`) — stricter than
// DICE_REGEX, which scans whole text. Used to validate `dice:` hrefs at the
// click site before they reach the roll flow. Keep/drop shorthands accept an
// optional count, matching what linkifyDice emits.
const DICE_NOTATION_REGEX = /^\d{1,3}d\d{1,3}(?:(?:kh|kl|dh|dl)\d{0,3})?(?:[+-]\d{1,4})?$/i

export function isValidDiceNotation(notation: string): boolean {
  return DICE_NOTATION_REGEX.test(notation)
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
