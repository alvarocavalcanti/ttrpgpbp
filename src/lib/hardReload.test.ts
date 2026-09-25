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
      set href(next: string) {
        capture.href = next
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
    // A getter-only location: the href assignment also throws, so reload()
    // is the only navigation left.
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
    hardReload()
    expect(capture.reload).toHaveBeenCalledTimes(1)
  })

  it('appends a cache-busting query when asked', () => {
    hardReload({ bustCache: true })
    expect(capture.replace).toHaveBeenCalledTimes(1)
    const href = capture.replace.mock.calls[0][0] as string
    expect(href).toMatch(/^http:\/\/localhost\/channel\/1\?v=\d+$/)
  })

  it('keeps existing query and hash when cache-busting', () => {
    capture.href = 'http://localhost/channel/1?tab=posts#latest'
    hardReload({ bustCache: true })
    const href = capture.replace.mock.calls[0][0] as string
    expect(href).toMatch(/^http:\/\/localhost\/channel\/1\?tab=posts&v=\d+#latest$/)
  })

  it('keeps the cache-bust when replace throws but href assignment works', () => {
    capture.replace.mockImplementation(() => {
      throw new Error('location.replace blocked')
    })
    hardReload({ bustCache: true })
    // The self-heal bust must survive the fallback: plain reload() would
    // re-serve the stale shell it is trying to escape.
    expect(capture.href).toMatch(/^http:\/\/localhost\/channel\/1\?v=\d+$/)
    expect(capture.reload).not.toHaveBeenCalled()
  })
})
