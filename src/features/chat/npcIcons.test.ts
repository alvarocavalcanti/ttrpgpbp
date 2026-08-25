import { describe, it, expect } from 'vitest'
import { isNpcIconUrl } from './npcIcons'

describe('isNpcIconUrl', () => {
  it('returns true for a game-icons URL', () => {
    expect(isNpcIconUrl('https://api.iconify.design/game-icons/wizard-face.svg')).toBe(true)
  })

  it('returns false for an unrelated URL', () => {
    expect(isNpcIconUrl('https://example.com/king.png')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isNpcIconUrl(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isNpcIconUrl(undefined)).toBe(false)
  })
})
