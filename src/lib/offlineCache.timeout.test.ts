import { describe, it, expect, vi } from 'vitest'

// A wedged or broken IndexedDB must never surface as a render error: every
// cache operation degrades to a no-op, and a read gives up at its deadline.
vi.mock('idb', () => ({
  openDB: vi.fn(() => Promise.resolve({
    get: () => new Promise(() => {}),
    put: vi.fn(() => Promise.reject(new Error('QuotaExceededError'))),
    delete: vi.fn(() => Promise.reject(new Error('blocked'))),
    getAllKeysFromIndex: vi.fn(() => Promise.reject(new Error('blocked'))),
    clear: vi.fn(() => Promise.reject(new Error('blocked'))),
  })),
}))

describe('offlineCache failure handling', () => {
  it('returns a miss when the store never answers', async () => {
    // The shared test setup imports the real cache module, so drop the module
    // registry first or the mocked idb would never be reached.
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { readSnapshot } = await import('./offlineCache')

    await expect(readSnapshot('user-1', 'profile')).resolves.toBeNull()
  }, 2000)

  it('swallows write, delete, prune, and clear failures', async () => {
    vi.resetModules()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cache = await import('./offlineCache')

    await expect(cache.writeSnapshot('user-1', 'profile', {})).resolves.toBeUndefined()
    await expect(cache.deleteSnapshot('user-1', 'profile')).resolves.toBeUndefined()
    await expect(cache.deleteChannelSnapshots('user-1', 'c1')).resolves.toBeUndefined()
    await expect(cache.pruneChannelSnapshots('user-1', [])).resolves.toBeUndefined()
    await expect(cache.clearUserSnapshots('user-1')).resolves.toBeUndefined()
    await expect(cache.clearAllSnapshots()).resolves.toBeUndefined()
  })
})
