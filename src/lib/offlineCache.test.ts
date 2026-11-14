import { describe, it, expect, afterEach } from 'vitest'
import { openDB } from 'idb'
import {
  CACHE_SCHEMA_VERSION,
  clearAllSnapshots,
  clearUserSnapshots,
  deleteChannelSnapshots,
  deleteSnapshot,
  pruneChannelSnapshots,
  readSnapshot,
  resetOfflineCacheForTests,
  writeSnapshot,
} from './offlineCache'

const DB_NAME = 'rolebypost-offline'
const STORE = 'snapshots'

async function putRawRecord(record: {
  key: string
  userId: string
  schemaVersion: number
  savedAt: string
  value: unknown
}) {
  const db = await openDB(DB_NAME, 1)
  await db.put(STORE, record)
  db.close()
}

async function getRawRecord(key: string) {
  const db = await openDB(DB_NAME, 1)
  const record = await db.get(STORE, key)
  db.close()
  return record
}

afterEach(async () => {
  await clearAllSnapshots()
  resetOfflineCacheForTests()
})

describe('offlineCache', () => {
  it('round-trips a snapshot with its saved timestamp', async () => {
    await writeSnapshot('user-1', 'profile', { display_name: 'Ada' })

    const cached = await readSnapshot<{ display_name: string }>('user-1', 'profile')

    expect(cached?.value).toEqual({ display_name: 'Ada' })
    expect(Number.isNaN(Date.parse(cached?.savedAt ?? ''))).toBe(false)
  })

  it('returns null for a key that was never written', async () => {
    await expect(readSnapshot('user-1', 'lobby')).resolves.toBeNull()
  })

  it('never serves one user the snapshot of another', async () => {
    await writeSnapshot('user-1', 'lobby', { channels: ['a'] })

    await expect(readSnapshot('user-2', 'lobby')).resolves.toBeNull()
  })

  it('drops a record written by an older cache schema', async () => {
    await putRawRecord({
      key: 'u:user-1:profile',
      userId: 'user-1',
      schemaVersion: CACHE_SCHEMA_VERSION - 1,
      savedAt: new Date().toISOString(),
      value: { display_name: 'stale' },
    })

    await expect(readSnapshot('user-1', 'profile')).resolves.toBeNull()
    await expect(getRawRecord('u:user-1:profile')).resolves.toBeUndefined()
  })

  it('deletes a single snapshot', async () => {
    await writeSnapshot('user-1', 'profile', { display_name: 'Ada' })

    await deleteSnapshot('user-1', 'profile')

    await expect(readSnapshot('user-1', 'profile')).resolves.toBeNull()
  })

  it('prunes channel, room, and message snapshots for channels that are gone', async () => {
    await writeSnapshot('user-1', 'profile', { display_name: 'Ada' })
    await writeSnapshot('user-1', 'lobby', { channels: ['a', 'b'] })
    await writeSnapshot('user-1', 'channel:a', { name: 'A' })
    await writeSnapshot('user-1', 'rooms:a', { rooms: [] })
    await writeSnapshot('user-1', 'messages:a:main', { messages: [] })
    await writeSnapshot('user-1', 'channel:b', { name: 'B' })
    await writeSnapshot('user-1', 'messages:b:main', { messages: [] })

    await pruneChannelSnapshots('user-1', ['a'])

    await expect(readSnapshot('user-1', 'channel:a')).resolves.not.toBeNull()
    await expect(readSnapshot('user-1', 'rooms:a')).resolves.not.toBeNull()
    await expect(readSnapshot('user-1', 'messages:a:main')).resolves.not.toBeNull()
    await expect(readSnapshot('user-1', 'channel:b')).resolves.toBeNull()
    await expect(readSnapshot('user-1', 'messages:b:main')).resolves.toBeNull()
    // Non-channel snapshots are out of scope for a prune.
    await expect(readSnapshot('user-1', 'profile')).resolves.not.toBeNull()
    await expect(readSnapshot('user-1', 'lobby')).resolves.not.toBeNull()
  })

  it('keeps a channel id that is a prefix of another', async () => {
    await writeSnapshot('user-1', 'channel:c1', { name: 'C1' })
    await writeSnapshot('user-1', 'channel:c10', { name: 'C10' })

    await pruneChannelSnapshots('user-1', ['c1'])

    await expect(readSnapshot('user-1', 'channel:c1')).resolves.not.toBeNull()
    await expect(readSnapshot('user-1', 'channel:c10')).resolves.toBeNull()
  })

  it('deletes every snapshot belonging to one channel', async () => {
    await writeSnapshot('user-1', 'channel:c1', { name: 'C1' })
    await writeSnapshot('user-1', 'rooms:c1', { rooms: [] })
    await writeSnapshot('user-1', 'messages:c1:main', { messages: [] })
    await writeSnapshot('user-1', 'messages:c1:r1', { messages: [] })
    await writeSnapshot('user-1', 'channel:c2', { name: 'C2' })
    await writeSnapshot('user-1', 'lobby', { channels: [] })

    await deleteChannelSnapshots('user-1', 'c1')

    await expect(readSnapshot('user-1', 'channel:c1')).resolves.toBeNull()
    await expect(readSnapshot('user-1', 'rooms:c1')).resolves.toBeNull()
    await expect(readSnapshot('user-1', 'messages:c1:main')).resolves.toBeNull()
    await expect(readSnapshot('user-1', 'messages:c1:r1')).resolves.toBeNull()
    await expect(readSnapshot('user-1', 'channel:c2')).resolves.not.toBeNull()
    await expect(readSnapshot('user-1', 'lobby')).resolves.not.toBeNull()
  })

  it('clears only the given user on sign-out', async () => {
    await writeSnapshot('user-1', 'profile', { display_name: 'Ada' })
    await writeSnapshot('user-1', 'lobby', { channels: [] })
    await writeSnapshot('user-2', 'profile', { display_name: 'Grace' })

    await clearUserSnapshots('user-1')

    await expect(readSnapshot('user-1', 'profile')).resolves.toBeNull()
    await expect(readSnapshot('user-1', 'lobby')).resolves.toBeNull()
    await expect(readSnapshot('user-2', 'profile')).resolves.not.toBeNull()
  })

  it('degrades to a no-op when IndexedDB is unavailable', async () => {
    resetOfflineCacheForTests()
    const original = globalThis.indexedDB
    // Simulate Safari private mode / an embedded webview with no storage.
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
    try {
      await expect(writeSnapshot('user-1', 'profile', {})).resolves.toBeUndefined()
      await expect(readSnapshot('user-1', 'profile')).resolves.toBeNull()
    } finally {
      Object.defineProperty(globalThis, 'indexedDB', { value: original, configurable: true })
      resetOfflineCacheForTests()
    }
  })
})
