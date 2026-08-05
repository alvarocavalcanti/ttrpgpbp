import { describe, it, expect } from 'vitest'
import { getSystemAttributes } from './index'

describe('Game Systems', () => {
  it('returns empty array for unknown or generic system', () => {
    expect(getSystemAttributes(undefined)).toEqual([])
    expect(getSystemAttributes('none')).toEqual([])
    expect(getSystemAttributes('unknown_system_xyz')).toEqual([])
  })
})
