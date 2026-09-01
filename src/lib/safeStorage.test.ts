import { describe, it, expect, beforeEach, vi } from 'vitest'
import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage'

describe('safeStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips values through localStorage', () => {
    safeSetItem('k', 'v')
    expect(safeGetItem('k')).toBe('v')
    safeRemoveItem('k')
    expect(safeGetItem('k')).toBeNull()
  })

  it('degrades to a no-op when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError')
    })
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError')
    })
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError', 'SecurityError')
    })

    expect(() => safeSetItem('k', 'v')).not.toThrow()
    expect(safeGetItem('k')).toBeNull()
    expect(() => safeRemoveItem('k')).not.toThrow()

    spy.mockRestore()
    getSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
