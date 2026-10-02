import { describe, it, expect } from 'vitest'
import { rollDice } from './rollDice'

// Deterministic rng: yields the given 32-bit samples in order, then repeats the
// last so a rejected sample still terminates the rejection loop.
function seqRng(...samples: number[]): () => number {
  let index = 0
  return () => samples[Math.min(index++, samples.length - 1)] ?? 0
}

describe('rollDice', () => {
  it('returns null for invalid notation', () => {
    expect(rollDice('not-dice')).toBeNull()
    expect(rollDice('2d6>=9')).toBeNull()
    expect(rollDice('')).toBeNull()
  })

  it('sums kept dice and adds the modifier', () => {
    // 2d6 -> 1, 4; +3 -> 8
    const result = rollDice('2d6+3', seqRng(0, 3))
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('sum')
    expect(result!.dice.map((d) => d.value)).toEqual([1, 4])
    expect(result!.dice.every((d) => d.kept)).toBe(true)
    expect(result!.total).toBe(8)
    expect(result!.successes).toBeNull()
  })

  it('keeps the highest die for advantage (kh1)', () => {
    // 2d20 -> 19, 3; keep high
    const result = rollDice('2d20kh1', seqRng(18, 2))
    expect(result!.dice.map((d) => [d.value, d.kept])).toEqual([
      [19, true],
      [3, false],
    ])
    expect(result!.total).toBe(19)
  })

  it('drops the lowest die for 4d6dl1', () => {
    // 4d6 -> 6, 2, 5, 3; drop lowest (2)
    const result = rollDice('4d6dl1', seqRng(5, 1, 4, 2))
    expect(result!.dice.map((d) => d.kept)).toEqual([true, false, true, true])
    expect(result!.total).toBe(14)
  })

  it('lists every face for a pool with no total', () => {
    const result = rollDice('4d6p', seqRng(0, 5, 2, 4))
    expect(result!.mode).toBe('pool')
    expect(result!.dice.map((d) => d.value)).toEqual([1, 6, 3, 5])
    expect(result!.dice.every((d) => d.kept)).toBe(true)
    expect(result!.total).toBeNull()
    expect(result!.successes).toBeNull()
  })

  it('counts faces at or above the target for success rolls', () => {
    // 5d6>=4 -> 4, 2, 6, 1, 5 -> 3 successes
    const result = rollDice('5d6>=4', seqRng(3, 1, 5, 0, 4))
    expect(result!.mode).toBe('successes')
    expect(result!.successes).toBe(3)
    expect(result!.target).toBe(4)
    expect(result!.total).toBeNull()
  })

  it('sorts pool faces highest-first', () => {
    const result = rollDice('4d6ps', seqRng(0, 5, 2, 4))
    expect(result!.dice.map((d) => d.value)).toEqual([6, 5, 3, 1])
  })

  it('rejects the biased tail sample before taking the modulo', () => {
    // d3: values 4294967295 (2^32 - 1) land in the partial tail and must be
    // discarded; 1 then yields face 2. Without rejection the tail sample would
    // have produced face 1.
    const result = rollDice('1d3', seqRng(4294967295, 1))
    expect(result!.dice[0].value).toBe(2)
  })

  it('keeps every face inside the die range with a saturated sample', () => {
    // d8 divides 2^32 evenly, so 2^32 - 1 is not rejected and maps to face 8.
    const result = rollDice('3d8', seqRng(4294967295))
    expect(result!.dice.map((d) => d.value)).toEqual([8, 8, 8])
  })
})
