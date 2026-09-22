import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hardReload } from './hardReload'

// jsdom's window.location is read-only, so swap it for a controllable stand-in
// and assert which navigation the helper performs.
const capture = {
  href: 'http://localhost/channel/1',
  replace: vi.fn(),
  reload: vi.fn(),
}

beforeEach(() => {
  capture.href = 'http://localhost/channel/1'
  capture.replace.mockReset()
  capture.reload.mockReset()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return capture.href
      },
      replace: capture.replace,
      reload: capture.reload,
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('hardReload', () => {
  it('navigates the location to the current URL', () => {
    hardReload()
    expect(capture.replace).toHaveBeenCalledTimes(1)
    expect(capture.replace).toHaveBeenCalledWith('http://localhost/channel/1')
  })

  it('does not fall back to reload when replace succeeds', () => {
    hardReload()
    expect(capture.reload).not.toHaveBeenCalled()
  })

  it('falls back to location.reload when replace throws', () => {
    capture.replace.mockImplementation(() => {
      throw new Error('location.replace blocked')
    })
    hardReload()
    expect(capture.reload).toHaveBeenCalledTimes(1)
  })
})
