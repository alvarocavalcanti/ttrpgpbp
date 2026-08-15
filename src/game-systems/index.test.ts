import { describe, it, expect } from 'vitest'
import { getSystemAttributes, clampModifier, DEFAULT_MODIFIER_LIMITS, isValidModifierInput } from './index'

describe('Game Systems', () => {
  it('returns empty array for unknown or generic system', () => {
    expect(getSystemAttributes(undefined)).toEqual([])
    expect(getSystemAttributes('none')).toEqual([])
    expect(getSystemAttributes('unknown_system_xyz')).toEqual([])
  })
})

describe('DEFAULT_MODIFIER_LIMITS', () => {
  it('uses D&D bounds -4/+5', () => {
    expect(DEFAULT_MODIFIER_LIMITS).toEqual({ min: -4, max: 5 })
  })
})

describe('clampModifier', () => {
  it('clamps generic system to default bounds [-4, 5]', () => {
    expect(clampModifier('none', 10)).toBe(5)
    expect(clampModifier('none', -10)).toBe(-4)
    expect(clampModifier('none', 2)).toBe(2)
  })

  it('clamps undefined system to default bounds [-4, 5]', () => {
    expect(clampModifier(undefined, 10)).toBe(5)
    expect(clampModifier(undefined, -10)).toBe(-4)
  })

  it('clamps unknown system to default bounds [-4, 5]', () => {
    expect(clampModifier('unknown', 10)).toBe(5)
    expect(clampModifier('unknown', -10)).toBe(-4)
  })

  it('clamps within Shadowdark bounds [-4, 4]', () => {
    expect(clampModifier('shadowdark', 5)).toBe(4)
    expect(clampModifier('shadowdark', -5)).toBe(-4)
    expect(clampModifier('shadowdark', 2)).toBe(2)
    expect(clampModifier('shadowdark', -2)).toBe(-2)
    expect(clampModifier('shadowdark', 4)).toBe(4)
    expect(clampModifier('shadowdark', -4)).toBe(-4)
    expect(clampModifier('shadowdark', 0)).toBe(0)
  })
})

describe('isValidModifierInput', () => {
  it('accepts integers and a leading minus', () => {
    expect(isValidModifierInput('0')).toBe(true)
    expect(isValidModifierInput('3')).toBe(true)
    expect(isValidModifierInput('-4')).toBe(true)
    expect(isValidModifierInput('-')).toBe(true)
    expect(isValidModifierInput('')).toBe(true)
  })

  it('rejects floats, exponents, and stray characters', () => {
    expect(isValidModifierInput('1.5')).toBe(false)
    expect(isValidModifierInput('1e3')).toBe(false)
    expect(isValidModifierInput('abc')).toBe(false)
    expect(isValidModifierInput('1-2')).toBe(false)
    expect(isValidModifierInput('--3')).toBe(false)
    expect(isValidModifierInput('+2')).toBe(false)
  })
})
