import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseAndRoll, linkifyDice } from './parser'

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
    expect(linkifyDice(text, ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'])).toBe('Make a [DEX Check](check:DEX:12).')
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
    expect(linkifyDice(text)).toBe('Make a [Charisma Check](check:Charisma:10).')
  })
})

describe('parseAndRoll', () => {
  beforeEach(() => {
    // Mock Math.random to return predictable values: 0.1, 0.5, 0.9, 0.2, ...
    let calls = 0
    const sequence = [0.1, 0.9, 0.5, 0.2, 0.8, 0.4, 0.6]
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const val = sequence[calls % sequence.length]
      calls++
      return val
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses basic NdX', () => {
    // 2d6
    // calls: 0.1, 0.9
    // rolls: floor(0.1*6)+1 = 1, floor(0.9*6)+1 = 6
    const res = parseAndRoll('2d6')
    expect(res.total).toBe(7)
    expect(res.rolls).toEqual([1, 6])
    expect(res.dropped).toEqual([])
    expect(res.modifier).toBe(0)
  })

  it('parses NdX+M', () => {
    // 3d8+2
    // calls: 0.1, 0.9, 0.5
    // rolls: 1, 8, 5
    const res = parseAndRoll('3d8+2')
    expect(res.total).toBe(16) // 1+8+5+2
    expect(res.rolls).toEqual([1, 8, 5])
    expect(res.modifier).toBe(2)
  })

  it('parses NdX-M', () => {
    const res = parseAndRoll('1d20-1')
    // call 0.1 -> roll 3
    expect(res.total).toBe(2) // 3-1
    expect(res.rolls).toEqual([3])
    expect(res.modifier).toBe(-1)
  })

  it('parses advantage (2d20kh1)', () => {
    // 2d20kh1
    // calls: 0.1, 0.9 -> rolls: 3, 19
    const res = parseAndRoll('2d20kh1')
    expect(res.rolls).toEqual([3, 19])
    expect(res.dropped).toEqual([3]) // dropped lowest
    expect(res.total).toBe(19)
  })

  it('parses advantage shorthand kh without a count (2d20kh+4)', () => {
    // kh without a number defaults to keep highest 1
    const res = parseAndRoll('2d20kh+4')
    expect(res.rolls).toEqual([3, 19])
    expect(res.dropped).toEqual([3])
    expect(res.total).toBe(23) // 19 + 4
  })

  it('parses drop lowest shorthand dl without a count (4d6dl)', () => {
    // calls: 0.1, 0.9, 0.5, 0.2 -> rolls: 1, 6, 4, 2
    const res = parseAndRoll('4d6dl')
    expect(res.rolls).toEqual([1, 6, 4, 2])
    expect(res.dropped).toEqual([1])
    expect(res.total).toBe(12) // 6+4+2
  })

  it('parses disadvantage (2d20kl1)', () => {
    const res = parseAndRoll('2d20kl1')
    expect(res.rolls).toEqual([3, 19])
    expect(res.dropped).toEqual([19]) // dropped highest
    expect(res.total).toBe(3)
  })

  it('parses drop lowest (4d6dl1)', () => {
    // 4d6
    // calls: 0.1, 0.9, 0.5, 0.2
    // rolls: 1, 6, 4, 2
    const res = parseAndRoll('4d6dl1')
    expect(res.rolls).toEqual([1, 6, 4, 2])
    expect(res.dropped).toEqual([1])
    expect(res.total).toBe(12) // 6+4+2
  })

  it('parses drop highest (4d6dh2)', () => {
    // rolls: 1, 6, 4, 2
    const res = parseAndRoll('4d6dh2')
    expect(res.rolls).toEqual([1, 6, 4, 2])
    expect(res.dropped.sort()).toEqual([4, 6])
    expect(res.total).toBe(3) // 1+2
  })
  
  it('handles keeping or dropping too many', () => {
    // 2d20 but keep highest 3 (more than rolled) -> keeps all
    expect(parseAndRoll('2d20kh3').rolls.length).toBe(2)
    // 2d20 drop highest 3 -> drops all
    const res = parseAndRoll('2d20dh3')
    expect(res.dropped.length).toBe(2)
    expect(res.total).toBe(0)

    // 2d20 drop lowest 3 -> drops all
    const res2 = parseAndRoll('2d20dl3')
    expect(res2.dropped.length).toBe(2)
    expect(res2.total).toBe(0)
  })

  it('handles spaces correctly', () => {
    const res = parseAndRoll(' 2 d 20 kh 1 + 5 ')
    expect(res.rolls).toEqual([3, 19])
    expect(res.dropped).toEqual([3])
    expect(res.total).toBe(24) // 19 + 5
  })

  it('throws on invalid notation', () => {
    expect(() => parseAndRoll('2d')).toThrow()
    expect(() => parseAndRoll('d20')).toThrow()
    expect(() => parseAndRoll('2d20x')).toThrow()
    expect(() => parseAndRoll('0d20')).toThrow()
    expect(() => parseAndRoll('1d0')).toThrow()
  })

  it('throws on too many dice or sides', () => {
    expect(() => parseAndRoll('101d20')).toThrow('Too many dice')
    expect(() => parseAndRoll('1d1001')).toThrow('Too many sides')
  })
})
