import { openDB, type IDBPDatabase } from 'idb'

// Local-first read cache for issue #825. Application screens hydrate from this
// store so a dropped connection never blanks the app, then refresh from the
// network and write the fresh snapshot back.
//
// Deliberately NOT a service-worker HTTP cache: Cache API keys are URL-only and
// ignore the Authorization header, so a cached Supabase response could be
// served to the next account signed in on the device. Keys here are namespaced
// by user id and the whole store is purged on sign-out.
//
// Best-effort by design: every failure (quota, blocked storage, corrupt record)
// degrades to a cache miss and never throws into a render path.

const DB_NAME = 'rolebypost-offline'
const STORE = 'snapshots'
const DB_VERSION = 1

export const CACHE_SCHEMA_VERSION = 1

// Bounds the persisted timeline so a long-lived channel cannot grow the local
// store without limit. Matches the network page size with room for scrollback.
export const CACHE_LIMITS = { messagesPerRoom: 100 }

// A wedged IndexedDB open (observed in some embedded webviews) must never hold
// a loading skeleton hostage, so reads race a short deadline and treat a
// timeout as a miss.
const READ_TIMEOUT_MS = 500

export interface CachedSnapshot<T> {
  value: T
  savedAt: string
}

interface SnapshotRecord {
  key: string
  userId: string
  schemaVersion: number
  savedAt: string
  value: unknown
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === 'undefined') return null
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('byUser', 'userId')
      },
    }).catch((err) => {
      // Leave the rejected promise memoized: a blocked/unsupported store should
      // be attempted once, not on every read.
      console.error('Offline cache unavailable', err)
      throw err
    })
  }
  return dbPromise
}

// Test-only: forget the memoized connection so a test can simulate an
// environment where IndexedDB is missing or blocked.
export function resetOfflineCacheForTests(): void {
  dbPromise = null
}

function snapshotKey(userId: string, name: string): string {
  return `u:${userId}:${name}`
}

function withDeadline<T>(promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS)
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

export async function readSnapshot<T>(userId: string, name: string): Promise<CachedSnapshot<T> | null> {
  const db = getDb()
  if (!db) return null
  try {
    const key = snapshotKey(userId, name)
    const record = await withDeadline(
      db.then((d) => d.get(STORE, key) as Promise<SnapshotRecord | undefined>),
    )
    if (!record) return null
    if (record.schemaVersion !== CACHE_SCHEMA_VERSION) {
      // A shape change invalidates the record rather than risking a render of
      // an older payload.
      await deleteSnapshot(userId, name)
      return null
    }
    return { value: record.value as T, savedAt: record.savedAt }
  } catch (err) {
    console.error('Failed to read offline cache', err)
    return null
  }
}

export async function writeSnapshot<T>(userId: string, name: string, value: T): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    const d = await db
    const record: SnapshotRecord = {
      key: snapshotKey(userId, name),
      userId,
      schemaVersion: CACHE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      value,
    }
    await d.put(STORE, record)
  } catch (err) {
    // Quota exceeded and blocked storage are both recoverable: the app keeps
    // working from the network, the next successful read tries again.
    console.error('Failed to write offline cache', err)
  }
}

export async function deleteSnapshot(userId: string, name: string): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    const d = await db
    await d.delete(STORE, snapshotKey(userId, name))
  } catch (err) {
    console.error('Failed to delete offline cache entry', err)
  }
}

const CHANNEL_KEY_PREFIXES = ['channel:', 'rooms:', 'messages:'] as const

// Deletes every snapshot that belongs to one channel (header, rooms, and each
// room's timeline). Used when access is revoked while the app is online, so a
// later offline open cannot resurrect a channel the viewer lost.
export async function deleteChannelSnapshots(userId: string, channelId: string): Promise<void> {
  const db = getDb()
  if (!db) return
  const base = `u:${userId}:`
  try {
    const d = await db
    const keys = (await d.getAllKeysFromIndex(STORE, 'byUser', userId)) as string[]
    const doomed = keys.filter((key) => {
      if (!key.startsWith(base)) return false
      const name = key.slice(base.length)
      const prefix = CHANNEL_KEY_PREFIXES.find((candidate) => name.startsWith(candidate))
      if (!prefix) return false
      return name.slice(prefix.length).split(':')[0] === channelId
    })
    await Promise.all(doomed.map((key) => d.delete(STORE, key)))
  } catch (err) {
    console.error('Failed to delete channel cache', err)
  }
}

// Drops per-channel snapshots for channels the viewer no longer belongs to
// (kicked, left, channel deleted). `profile` and `lobby` are never touched.
export async function pruneChannelSnapshots(userId: string, liveChannelIds: string[]): Promise<void> {
  const db = getDb()
  if (!db) return
  const live = new Set(liveChannelIds)
  const base = `u:${userId}:`
  try {
    const d = await db
    const keys = (await d.getAllKeysFromIndex(STORE, 'byUser', userId)) as string[]
    const stale = keys.filter((key) => {
      if (!key.startsWith(base)) return false
      const name = key.slice(base.length)
      const prefix = CHANNEL_KEY_PREFIXES.find((candidate) => name.startsWith(candidate))
      if (!prefix) return false
      const channelId = name.slice(prefix.length).split(':')[0]
      return Boolean(channelId) && !live.has(channelId)
    })
    await Promise.all(stale.map((key) => d.delete(STORE, key)))
  } catch (err) {
    console.error('Failed to prune offline cache', err)
  }
}

export async function clearUserSnapshots(userId: string): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    const d = await db
    const keys = (await d.getAllKeysFromIndex(STORE, 'byUser', userId)) as string[]
    await Promise.all(keys.map((key) => d.delete(STORE, key)))
  } catch (err) {
    console.error('Failed to clear offline cache', err)
  }
}

export async function clearAllSnapshots(): Promise<void> {
  const db = getDb()
  if (!db) return
  try {
    const d = await db
    await d.clear(STORE)
  } catch (err) {
    console.error('Failed to clear offline cache', err)
  }
}
