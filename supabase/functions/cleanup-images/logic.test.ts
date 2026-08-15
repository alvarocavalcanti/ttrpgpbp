import { describe, it, expect } from 'vitest'
import { collectExpiredImages } from './logic.ts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('collectExpiredImages', () => {
  const now = Date.UTC(2026, 0, 15)

  it('returns paths older than the cutoff', () => {
    const files = [
      { path: 'c1/message/a.jpg', lastModified: new Date(now - 10 * DAY_MS).toISOString() },
      { path: 'c1/message/b.jpg', lastModified: new Date(now - 1 * DAY_MS).toISOString() },
    ]
    expect(collectExpiredImages(files, now - 7 * DAY_MS)).toEqual(['c1/message/a.jpg'])
  })

  it('keeps images newer than the cutoff', () => {
    const files = [
      { path: 'c1/message/a.jpg', lastModified: new Date(now - 1 * DAY_MS).toISOString() },
    ]
    expect(collectExpiredImages(files, now - 7 * DAY_MS)).toEqual([])
  })

  it('never deletes files without a usable lastModified', () => {
    const files = [
      { path: 'c1/avatar/x.jpg', lastModified: '' },
      { path: 'c1/avatar/y.jpg', lastModified: 'not-a-date' },
    ]
    expect(collectExpiredImages(files, now)).toEqual([])
  })
})
