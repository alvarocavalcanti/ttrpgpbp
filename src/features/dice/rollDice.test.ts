import { describe, it, expect } from 'vitest'
import { rollDice } from './rollDice'

// Deterministic rng: yields the given [0,1) units in order, then repeats the
// last so a miscount can never silently consume undefined.
function seqRng(...units: number[]): () => number {
  let index = 0
  return () => units[Math.min(index++, units.length - 1)] ?? 0
}

describe('rollDice', () => {
  it('returns null for invalid notation', () => {
    expect(rollDice('not-dice')).toBeNull()
    expect(rollDice('2d6>=9')).toBeNull()
    expect(rollDice('')).toBeNull()
  })

  it('sums kept dice and adds the modifier', () => {
    // 2d6 -> 1, 4; +3 -> 8
    const result = rollDice('2d6+3', seqRng(0, 0.5))
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('sum')
    expect(result!.dice.map((d) => d.value)).toEqual([1, 4])
    expect(result!.dice.every((d) => d.kept)).toBe(true)
    expect(result!.total).toBe(8)
    expect(result!.successes).toBeNull()
  })

  it('keeps the highest die for advantage (kh1)', () => {
    // 2d20 -> 19, 3; keep high
    const result = rollDice('2d20kh1', seqRng(0.9, 0.1))
    expect(result!.dice.map((d) => [d.value, d.kept])).toEqual([
      [19, true],
      [3, false],
    ])
    expect(result!.total).toBe(19)
  })

  it('drops the lowest die for 4d6dl1', () => {
    // 4d6 -> 6, 2, 5, 3; drop lowest (2)
    const result = rollDice('4d6dl1', seqRng(0.9, 0.2, 0.7, 0.4))
    expect(result!.dice.map((d) => d.kept)).toEqual([true, false, true, true])
    expect(result!.total).toBe(14)
  })

  it('lists every face for a pool with no total', () => {
    const result = rollDice('4d6p', seqRng(0.1, 0.9, 0.4, 0.7))
    expect(result!.mode).toBe('pool')
    expect(result!.dice.map((d) => d.value)).toEqual([1, 6, 3, 5])
    expect(result!.dice.every((d) => d.kept)).toBe(true)
    expect(result!.total).toBeNull()
    expect(result!.successes).toBeNull()
  })

  it('counts faces at or above the target for success rolls', () => {
    // 5d6>=4 -> 4, 2, 6, 1, 5 -> 3 successes
    const result = rollDice('5d6>=4', seqRng(0.5, 0.2, 0.9, 0, 0.7))
    expect(result!.mode).toBe('successes')
    expect(result!.successes).toBe(3)
    expect(result!.target).toBe(4)
    expect(result!.total).toBeNull()
  })

  it('sorts pool faces highest-first', () => {
    const result = rollDice('4d6ps', seqRng(0.1, 0.9, 0.4, 0.7))
    expect(result!.dice.map((d) => d.value)).toEqual([6, 5, 3, 1])
  })

  it('keeps every face inside the die range even with a saturated rng', () => {
    const result = rollDice('3d8', seqRng(1, 1, 1))
    expect(result!.dice.map((d) => d.value)).toEqual([8, 8, 8])
  })
})
