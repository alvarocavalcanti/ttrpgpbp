import { describe, it, expect, vi, afterEach } from 'vitest'
import { updateAppBadge } from './appBadge'

describe('updateAppBadge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets the badge when there is unread and badges are enabled', () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })

    updateAppBadge(7, true)
    expect(setAppBadge).toHaveBeenCalledWith(7)
    expect(clearAppBadge).not.toHaveBeenCalled()
  })

  it('clears the badge when there is no unread', () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })

    updateAppBadge(0, true)
    expect(clearAppBadge).toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('clears the badge even when badges are disabled', () => {
    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })

    updateAppBadge(3, false)
    expect(clearAppBadge).toHaveBeenCalled()
    expect(setAppBadge).not.toHaveBeenCalled()
  })

  it('does nothing when neither badge API exists', () => {
    vi.stubGlobal('navigator', {})
    expect(() => updateAppBadge(1, true)).not.toThrow()
  })
})
