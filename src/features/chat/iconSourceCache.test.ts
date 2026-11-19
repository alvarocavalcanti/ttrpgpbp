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

  it('treats a record from the future (clock skew) as a miss', () => {
    const now = Date.now()
    writeCachedIconBodies({ 'wizard-face': source }, now + 5 * 60 * 1000)

    expect(readCachedIconBodies(now)).toEqual({})
  })

  it('degrades to a miss on corrupt or foreign payloads', () => {
    localStorage.setItem(ICON_BODY_CACHE_KEY, '{not json')
    expect(readCachedIconBodies()).toEqual({})

    localStorage.setItem(ICON_BODY_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), sources: 'nope' }))
    expect(readCachedIconBodies()).toEqual({})

    localStorage.setItem(ICON_BODY_CACHE_KEY, JSON.stringify({ savedAt: 'soon', sources: {} }))
    expect(readCachedIconBodies()).toEqual({})
  })

  it('drops entries with an unusable body or size', () => {
    localStorage.setItem(ICON_BODY_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      sources: {
        'wizard-face': { body: BODY, size: 512 },
        'dragon-head': { body: '', size: 512 },
        'ogre': { body: BODY, size: 0 },
        'skeleton': 'nope',
      },
    }))

    expect(readCachedIconBodies()).toEqual({ 'wizard-face': source })
  })

  // Searched icons must never reach local storage: the cache is the curated
  // grid only, so its size stays fixed while composer drafts share the quota.
  it('keeps searched (non-curated) icons out of storage and memory', () => {
    writeCachedIconBodies({ 'wizard-face': source, 'some-searched-icon': source })
    expect(readCachedIconBodies()).toEqual({ 'wizard-face': source })

    localStorage.setItem(ICON_BODY_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      sources: { 'wizard-face': source, 'some-searched-icon': source },
    }))
    expect(readCachedIconBodies()).toEqual({ 'wizard-face': source })
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

  it('never throws when the store rejects the write', () => {    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
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
