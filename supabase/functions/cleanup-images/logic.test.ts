import { describe, it, expect, vi } from 'vitest'
import {
  collectExpiredImages,
  isAuthorizedCleanupRequest,
  listAllObjects,
  positiveRetentionDays,
  runCleanup,
  splitCleanupBatches,
} from './logic.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 0, 15)

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

describe('cleanup authorization', () => {
  it('accepts only the expected secret header', () => {
    const request = new Request('https://example.com', { headers: { 'x-cleanup-secret': 'secret' } })
    expect(isAuthorizedCleanupRequest(request, 'secret')).toBe(true)
    expect(isAuthorizedCleanupRequest(request, 'wrong')).toBe(false)
    expect(isAuthorizedCleanupRequest(request, undefined)).toBe(false)
  })
})

describe('cleanup configuration and batching', () => {
  it('only enables positive integer retention values', () => {
    expect(positiveRetentionDays(30)).toBe(30)
    expect(positiveRetentionDays(0)).toBe(0)
    expect(positiveRetentionDays(-1)).toBe(0)
    expect(positiveRetentionDays(1.5)).toBe(0)
    expect(positiveRetentionDays('not a number')).toBe(0)
  })

  it('splits objects into deletion-sized batches', () => {
    const paths = Array.from({ length: 1001 }, (_, i) => `c1/message/${i}.jpg`)
    const batches = splitCleanupBatches(paths)
    expect(batches.map(batch => batch.length)).toEqual([500, 500, 1])
  })
})

describe('listAllObjects', () => {
  const makeObjects = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ name: `obj-${i}`, id: `id-${i}` }))

  function pagedList(count: number) {
    return vi.fn().mockImplementation((_path: string, { limit, offset }: { limit: number; offset: number }) =>
      Promise.resolve(makeObjects(count).slice(offset, offset + limit)),
    )
  }

  it('returns every object across multiple pages past the 1000 cap', async () => {
    const list = pagedList(2500)
    const objects = await listAllObjects(list, '')
    expect(objects).toHaveLength(2500)
    expect(list).toHaveBeenCalledWith('', { limit: 1000, offset: 0 })
    expect(list).toHaveBeenCalledWith('', { limit: 1000, offset: 1000 })
    expect(list).toHaveBeenCalledWith('', { limit: 1000, offset: 2000 })
  })

  it('returns objects from a single short page', async () => {
    const objects = await listAllObjects(pagedList(3), 'c1')
    expect(objects.map(o => o.name)).toEqual(['obj-0', 'obj-1', 'obj-2'])
  })

  it('returns an empty array when nothing is listed', async () => {
    expect(await listAllObjects(pagedList(0), 'c1')).toEqual([])
  })
})

describe('runCleanup', () => {
  it('does not list, audit, or delete while retention is disabled', async () => {
    const listImages = vi.fn()
    const auditBatch = vi.fn()
    const removeImages = vi.fn()

    await expect(runCleanup({
      getRetentionDays: async () => 0,
      listImages,
      auditBatch,
      markBatchDeleted: vi.fn(),
      markBatchFailed: vi.fn(),
      removeImages,
    })).resolves.toEqual({ deleted: 0, retentionDays: 0 })

    expect(listImages).not.toHaveBeenCalled()
    expect(auditBatch).not.toHaveBeenCalled()
    expect(removeImages).not.toHaveBeenCalled()
  })

  it('audits each batch before deleting and marks it complete', async () => {
    const paths = Array.from({ length: 501 }, (_, i) => `c1/message/${i}.jpg`)
    const auditBatch = vi.fn()
      .mockResolvedValueOnce('audit-1')
      .mockResolvedValueOnce('audit-2')
    const markBatchDeleted = vi.fn().mockResolvedValue(undefined)
    const removeImages = vi.fn().mockResolvedValue(undefined)

    await expect(runCleanup({
      getRetentionDays: async () => 7,
      listImages: async () => paths.map(path => ({ path, lastModified: new Date(NOW - 8 * DAY_MS).toISOString() })),
      auditBatch,
      markBatchDeleted,
      markBatchFailed: vi.fn(),
      removeImages,
    }, NOW, 'run-1')).resolves.toEqual({ deleted: 501, retentionDays: 7 })

    expect(auditBatch).toHaveBeenCalledTimes(2)
    expect(auditBatch.mock.calls[0][0]).toMatchObject({ runId: 'run-1', retentionDays: 7, objectPaths: paths.slice(0, 500) })
    expect(removeImages).toHaveBeenNthCalledWith(1, paths.slice(0, 500))
    expect(removeImages).toHaveBeenNthCalledWith(2, paths.slice(500))
    expect(markBatchDeleted).toHaveBeenCalledWith('audit-1')
    expect(markBatchDeleted).toHaveBeenCalledWith('audit-2')
  })

  it('marks failed batches and stops before deleting later batches', async () => {
    const markBatchFailed = vi.fn().mockResolvedValue(undefined)
    const removeImages = vi.fn().mockRejectedValue(new Error('storage unavailable'))
    const auditBatch = vi.fn().mockResolvedValue('audit-1')

    await expect(runCleanup({
      getRetentionDays: async () => 7,
      listImages: async () => [{ path: 'c1/message/1.jpg', lastModified: new Date(NOW - 8 * DAY_MS).toISOString() }],
      auditBatch,
      markBatchDeleted: vi.fn(),
      markBatchFailed,
      removeImages,
    }, NOW, 'run-1')).rejects.toThrow('storage unavailable')

    expect(markBatchFailed).toHaveBeenCalledWith('audit-1', 'storage unavailable')
  })
})
