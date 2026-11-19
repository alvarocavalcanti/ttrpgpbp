import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ICON_BODY_CACHE_KEY,
  ICON_BODY_TTL_MS,
  readCachedIconBodies,
  writeCachedIconBodies,
  type IconSource,
} from './iconSourceCache'
import { CURATED_NPC_ICONS } from './npcIcons'

const BODY = '<path fill="currentColor" d="M0 0"/>'
const source: IconSource = { body: BODY, size: 512 }
const DAY = 24 * 60 * 60 * 1000

function store(entries: Record<string, unknown>, now: number) {
  localStorage.setItem(ICON_BODY_CACHE_KEY, JSON.stringify({ sources: entries }))
  return now
}

describe('iconSourceCache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('round-trips curated bodies', () => {
    writeCachedIconBodies({ 'wizard-face': source })

    expect(readCachedIconBodies()).toEqual({ 'wizard-face': source })
  })

  it('treats an entry past the TTL as a miss', () => {
    const savedAt = Date.now()
    writeCachedIconBodies({ 'wizard-face': source }, savedAt)

    expect(readCachedIconBodies(savedAt + ICON_BODY_TTL_MS)).toEqual({ 'wizard-face': source })
    expect(readCachedIconBodies(savedAt + ICON_BODY_TTL_MS + 1)).toEqual({})
  })

  // A shared record timestamp let a body added on day 6 renew the week of a
  // body stored on day 0, so the older one survived well past its expiry.
  it('keeps each entry aging on its own clock', () => {
    const t0 = Date.now()
    writeCachedIconBodies({ 'wizard-face': source }, t0)
    writeCachedIconBodies({ 'dragon-head': source }, t0 + 6 * DAY)

    expect(readCachedIconBodies(t0 + 7 * DAY + 1)).toEqual({ 'dragon-head': source })
  })

  it('cannot revive an expired entry through a later batch', () => {
    const t0 = Date.now()
    writeCachedIconBodies({ 'wizard-face': source }, t0)
    writeCachedIconBodies({ 'dragon-head': source }, t0 + 8 * DAY)

    expect(readCachedIconBodies(t0 + 8 * DAY)).toEqual({ 'dragon-head': source })
    expect(localStorage.getItem(ICON_BODY_CACHE_KEY)).not.toContain('wizard-face')
  })

  it('treats an entry from the future (clock skew) as a miss', () => {
    const now = Date.now()
    writeCachedIconBodies({ 'wizard-face': source }, now + 5 * 60 * 1000)

    expect(readCachedIconBodies(now)).toEqual({})
  })

  it('degrades to a miss on corrupt or foreign payloads', () => {
    localStorage.setItem(ICON_BODY_CACHE_KEY, '{not json')
    expect(readCachedIconBodies()).toEqual({})

    localStorage.setItem(ICON_BODY_CACHE_KEY, JSON.stringify({ sources: 'nope' }))
    expect(readCachedIconBodies()).toEqual({})

    store({ 'wizard-face': { body: BODY, size: 512, savedAt: 'soon' } }, Date.now())
    expect(readCachedIconBodies()).toEqual({})
  })

  it('drops entries with an unusable body or size', () => {
    const now = Date.now()
    store({
      'wizard-face': { body: BODY, size: 512, savedAt: now },
      'dragon-head': { body: '', size: 512, savedAt: now },
      'ogre': { body: BODY, size: 0, savedAt: now },
      'skeleton': 'nope',
    }, now)

    expect(readCachedIconBodies(now)).toEqual({ 'wizard-face': source })
  })

  // Searched icons must never reach local storage: the cache is the curated
  // grid only, so its size stays fixed while composer drafts share the quota.
  it('keeps searched (non-curated) icons out of storage and memory', () => {
    writeCachedIconBodies({ 'wizard-face': source, 'some-searched-icon': source })
    expect(readCachedIconBodies()).toEqual({ 'wizard-face': source })

    const now = Date.now()
    store({
      'wizard-face': { body: BODY, size: 512, savedAt: now },
      'some-searched-icon': { body: BODY, size: 512, savedAt: now },
    }, now)
    expect(readCachedIconBodies(now)).toEqual({ 'wizard-face': source })
  })

  it('merges a partial batch into the stored set', () => {
    writeCachedIconBodies({ 'wizard-face': source })
    writeCachedIconBodies({ 'dragon-head': source })

    expect(Object.keys(readCachedIconBodies()).sort()).toEqual(['dragon-head', 'wizard-face'])
  })

  it('leaves the cache untouched when there is nothing valid to store', () => {
    writeCachedIconBodies({ 'wizard-face': source })
    writeCachedIconBodies({})

    expect(readCachedIconBodies()).toEqual({ 'wizard-face': source })
  })

  it('does not rewrite the blob when nothing changed', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    writeCachedIconBodies({ 'wizard-face': source })
    setItem.mockClear()
    writeCachedIconBodies({ 'wizard-face': source, 'some-searched-icon': source })

    expect(setItem).not.toHaveBeenCalled()
    expect(readCachedIconBodies()).toEqual({ 'wizard-face': source })
  })

  it('never throws when the store rejects the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })

    expect(() => writeCachedIconBodies({ 'wizard-face': source })).not.toThrow()
    expect(readCachedIconBodies()).toEqual({})
  })

  it('stays under 100 KB with every curated icon stored at a realistic body size', () => {
    // game-icons bodies average ~1.7 KB (measured against the live API); a
    // 32-icon blob must stay far below the ~5 MB the drafts also live in.
    const body = `<path fill="currentColor" d="M0 0 ${'1.234 5.678 '.repeat(120)}"/>`
    const all: Record<string, IconSource> = {}
    for (const id of CURATED_NPC_ICONS) all[id] = { body, size: 512 }
    writeCachedIconBodies(all)

    expect(localStorage.getItem(ICON_BODY_CACHE_KEY)!.length).toBeLessThan(100_000)
    expect(Object.keys(readCachedIconBodies())).toHaveLength(CURATED_NPC_ICONS.length)
  })
})
