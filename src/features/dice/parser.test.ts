import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseAndRoll } from './parser'

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
