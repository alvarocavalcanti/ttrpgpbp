import { describe, it, expect } from 'vitest'
import { linkifyDice, isValidDiceNotation } from './parser'

describe('isValidDiceNotation', () => {
  it('accepts the notations linkifyDice produces', () => {
    expect(isValidDiceNotation('1d20')).toBe(true)
    expect(isValidDiceNotation('3d6kh1+2')).toBe(true)
    expect(isValidDiceNotation('4d6dl1-1')).toBe(true)
    expect(isValidDiceNotation('2d20kh1')).toBe(true)
    // Keep/drop shorthands without a trailing count (regression: linkifyDice
    // emits these and the click-site gate rejected them).
    expect(isValidDiceNotation('2d20kh+4')).toBe(true)
    expect(isValidDiceNotation('4d6dl')).toBe(true)
  })

  it('rejects hand-crafted href payloads that are not dice notation', () => {
    expect(isValidDiceNotation('anything')).toBe(false)
    expect(isValidDiceNotation('1d20; drop table users')).toBe(false)
    expect(isValidDiceNotation('d20')).toBe(false)
    expect(isValidDiceNotation('')).toBe(false)
  })
})

describe('linkifyDice', () => {
  it('turns dice notation into markdown links', () => {
    const text = 'Roll a 1d20+5 to hit.'
    expect(linkifyDice(text)).toBe('Roll a [1d20+5](dice:1d20+5) to hit.')
  })

  it('skips dice notation inside inline code blocks', () => {
    const text = 'Use `1d20` for attacks.'
    expect(linkifyDice(text)).toBe('Use `1d20` for attacks.')
  })

  it('skips dice notation inside multiline code blocks', () => {
    const text = '```\n1d20\n```\nBut outside 2d6 works.'
    expect(linkifyDice(text)).toBe('```\n1d20\n```\nBut outside [2d6](dice:2d6) works.')
  })

  it('handles multiple dice notations', () => {
    const text = '1d20+5 and 2d6-1'
    expect(linkifyDice(text)).toBe('[1d20+5](dice:1d20+5) and [2d6-1](dice:2d6-1)')
  })

  it('linkifies keep/drop shorthands without a count', () => {
    expect(linkifyDice('Roll 2d20kh+4')).toBe('Roll [2d20kh+4](dice:2d20kh+4)')
    expect(linkifyDice('Roll 4d6dl')).toBe('Roll [4d6dl](dice:4d6dl)')
  })

  it('turns ability checks into markdown links', () => {
    const text = 'Make a STR Check or a Dexterity Check.'
    expect(linkifyDice(text)).toBe('Make a [STR Check](check:STR) or a [Dexterity Check](check:Dexterity).')
  })

  it('captures a called-out DC in the check link', () => {
    const text = 'Make a DC 12 DEX Check.'
    expect(linkifyDice(text, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])).toBe('Make a [DEX Check (DC 12)](check:DEX:12).')
  })

  it('does not linkify checks for names outside the system attributes', () => {
    const text = 'Make a DC 18 Athletics Check.'
    expect(linkifyDice(text, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])).toBe('Make a DC 18 Athletics Check.')
  })

  it('derives check recognition from the provided system attributes', () => {
    const text = 'Make a DEX Check and a Perception Check.'
    // DEX is in the system list, Perception is not
    expect(linkifyDice(text, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])).toBe('Make a [DEX Check](check:DEX) and a Perception Check.')
  })

  it('falls back to the generic attribute set when no system attributes are provided', () => {
    const text = 'Make a STR Check or a Charisma Check.'
    expect(linkifyDice(text)).toBe('Make a [STR Check](check:STR) or a [Charisma Check](check:Charisma).')
  })

  it('handles a DC check on a generic (no system) attribute', () => {
    const text = 'Make a DC 10 Charisma Check.'
    expect(linkifyDice(text)).toBe('Make a [Charisma Check (DC 10)](check:Charisma:10).')
  })

  it('captures a trailing advantage in a check link', () => {
    const text = 'Make an INT Check with advantage.'
    expect(linkifyDice(text, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])).toBe('Make an [INT Check with advantage](check:INT:adv).')
  })

  it('captures a trailing disadvantage in a check link', () => {
    const text = 'Make a DEX Check with disadvantage.'
    expect(linkifyDice(text, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])).toBe('Make a [DEX Check with disadvantage](check:DEX:dis).')
  })

  it('captures a DC check with disadvantage', () => {
    const text = 'Make a DC 12 Int check with disadvantage.'
    expect(linkifyDice(text, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])).toBe('Make a [Int Check (DC 12) with disadvantage](check:Int:12:dis).')
  })

  it('does not capture adv/dis when no check word follows', () => {
    const text = 'Make an INT Check with advantage to see the door.'
    expect(linkifyDice(text, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])).toBe('Make an [INT Check with advantage](check:INT:adv) to see the door.')
  })
})

