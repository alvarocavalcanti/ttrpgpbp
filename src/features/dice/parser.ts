const DICE_REGEX = /\b(\d+d\d+(?:(?:kh|kl|dh|dl)\d*)?(?:[+-]\d+)?)\b/gi

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
