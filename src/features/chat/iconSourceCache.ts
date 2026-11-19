import { safeGetItem, safeSetItem } from '../../lib/safeStorage'
import { CURATED_NPC_ICONS } from './npcIcons'

// Bodies of the curated portraits only. Iconify's image endpoint rate-limits
// bursts (#835), so the picker renders previews from these instead of hitting
// it; caching them locally makes the first paint request-free. Searched sets
// stay in the HTTP cache: persisting them would grow without bound toward the
// quota that composer drafts share.
export interface IconSource {
  body: string
  size: number
}

// Each entry carries its own age: a single record timestamp would let a newer
// body renew the week of everything stored alongside it.
interface StoredSource extends IconSource {
  savedAt: number
}

// Bump when the record shape or the data-URL encoding changes.
export const ICON_BODY_CACHE_KEY = 'npc-icon-bodies-v1'
export const ICON_BODY_TTL_MS = 7 * 24 * 60 * 60 * 1000

const MAX_SIZE = 4096
// A clock that jumped backwards would otherwise keep an entry "fresh" forever.
const MAX_CLOCK_LEAD_MS = 60_000

const CURATED_IDS = new Set<string>(CURATED_NPC_ICONS)

function isIconSource(value: unknown): value is IconSource {
  if (!value || typeof value !== 'object') return false
  const { body, size } = value as Partial<IconSource>
  return typeof body === 'string' && body.length > 0 &&
    typeof size === 'number' && Number.isFinite(size) && size > 0 && size <= MAX_SIZE
}

// Corrupt, foreign, expired, or orphaned entries are dropped one by one, so a
// single bad record cannot poison the rest of the cache.
function readStored(now: number): Record<string, StoredSource> {
  const raw = safeGetItem(ICON_BODY_CACHE_KEY)
  if (!raw) return {}
  let parsed: { sources?: unknown } | null
  try {
    parsed = JSON.parse(raw) as { sources?: unknown } | null
  } catch {
    return {}
  }
  const sources = parsed?.sources
  if (!sources || typeof sources !== 'object') return {}

  const stored: Record<string, StoredSource> = {}
  for (const [id, value] of Object.entries(sources as Record<string, unknown>)) {
    if (!CURATED_IDS.has(id) || !isIconSource(value)) continue
    const { savedAt } = value as Partial<StoredSource>
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) continue
    if (savedAt > now + MAX_CLOCK_LEAD_MS || now - savedAt > ICON_BODY_TTL_MS) continue
    stored[id] = { body: value.body, size: value.size, savedAt }
  }
  return stored
}

export function readCachedIconBodies(now = Date.now()): Record<string, IconSource> {
  const cached: Record<string, IconSource> = {}
  for (const [id, { body, size }] of Object.entries(readStored(now))) {
    cached[id] = { body, size }
  }
  return cached
}

// Pass only what was just fetched: an entry that is already stored keeps its
// original age, so retention cannot be renewed by an unrelated batch.
export function writeCachedIconBodies(sources: Record<string, IconSource>, now = Date.now()): void {
  const next = readStored(now)
  let changed = false
  for (const [id, source] of Object.entries(sources)) {
    if (!CURATED_IDS.has(id) || !isIconSource(source)) continue
    const previous = next[id]
    if (previous && previous.body === source.body && previous.size === source.size) continue
    next[id] = { ...source, savedAt: now }
    changed = true
  }
  if (!changed) return
  safeSetItem(ICON_BODY_CACHE_KEY, JSON.stringify({ sources: next }))
}
