export interface DiceRollResult {
  notation: string
  total: number
  rolls: number[]
  dropped: number[]
  modifier: number
}

const DICE_REGEX = /\b(\d+d\d+(?:kh\d+|kl\d+|dh\d+|dl\d+)?(?:[+-]\d+)?)\b/gi
const CHECK_REGEX = /\b(STR|DEX|CON|INT|WIS|CHA|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Check\b/gi

// Preprocesses text to turn dice notations into markdown links, skipping code blocks
export function linkifyDice(text: string): string {
  if (!text) return text
  const parts = text.split(/(```[\s\S]*?```|`[^`]*`)/g)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) { // outside code blocks
      parts[i] = parts[i]
        .replace(DICE_REGEX, '[$1](dice:$1)')
        .replace(CHECK_REGEX, '[$1 Check](check:$1)')
    }
  }
  return parts.join('')
}

// Parses and evaluates dice notation
export function parseAndRoll(notation: string): DiceRollResult {
  // normalize
  const normalized = notation.toLowerCase().replace(/\s+/g, '')

  // match pattern: NdX[khN|klN|dlN|dhN][+M|-M]
  const regex = /^(\d+)d(\d+)(kh\d+|kl\d+|dh\d+|dl\d+)?(?:([+-])(\d+))?$/

  const match = normalized.match(regex)
  if (!match) {
    throw new Error(`Invalid dice notation: ${notation}`)
  }

  const [, nStr, dStr, keepDropMod, sign, modStr] = match
  const count = parseInt(nStr, 10)
  const sides = parseInt(dStr, 10)
  let modifier = 0

  if (sign && modStr) {
    modifier = parseInt(modStr, 10)
    if (sign === '-') modifier = -modifier
  }

  if (count <= 0 || sides <= 0) {
    throw new Error(`Invalid dice notation: ${notation}`)
  }
  
  if (count > 100) {
    throw new Error('Too many dice')
  }
  
  if (sides > 1000) {
    throw new Error('Too many sides')
  }

  const rolls: number[] = []
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1)
  }

  let finalRolls = [...rolls]
  const dropped: number[] = []

  if (keepDropMod) {
    const type = keepDropMod.substring(0, 2)
    const amount = parseInt(keepDropMod.substring(2), 10)

    if (amount >= count) {
      // keeping more than we have keeps all, dropping more than we have drops all
      if (type === 'dl' || type === 'dh') {
        dropped.push(...finalRolls)
        finalRolls = []
      }
    } else {
      const sorted = [...rolls].sort((a, b) => a - b)
      
      let toDrop: number[] = []
      
      switch (type) {
        case 'kh': { // keep highest
          toDrop = sorted.slice(0, count - amount)
          break
        }
        case 'kl': { // keep lowest
          toDrop = sorted.slice(amount)
          break
        }
        case 'dh': { // drop highest
          toDrop = sorted.slice(count - amount)
          break
        }
        case 'dl': { // drop lowest
          toDrop = sorted.slice(0, amount)
          break
        }
      }

      // carefully remove from finalRolls so we preserve original order for kept dice
      for (const d of toDrop) {
        const idx = finalRolls.indexOf(d)
        if (idx !== -1) {
          finalRolls.splice(idx, 1)
          dropped.push(d)
        }
      }
    }
  }

  const total = finalRolls.reduce((sum, r) => sum + r, 0) + modifier

  return {
    notation,
    total,
    rolls,
    dropped,
    modifier
  }
}
