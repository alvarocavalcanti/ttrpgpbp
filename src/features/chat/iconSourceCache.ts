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

interface StoredSources {
  savedAt: number
  sources: Record<string, IconSource>
}

// Bump when the record shape or the data-URL encoding changes.
export const ICON_BODY_CACHE_KEY = 'npc-icon-bodies-v1'
export const ICON_BODY_TTL_MS = 7 * 24 * 60 * 60 * 1000

const MAX_SIZE = 4096
// A clock that jumped backwards would otherwise keep a record "fresh" forever.
const MAX_CLOCK_LEAD_MS = 60_000

const CURATED_IDS = new Set<string>(CURATED_NPC_ICONS)

function isIconSource(value: unknown): value is IconSource {
  if (!value || typeof value !== 'object') return false
  const { body, size } = value as Partial<IconSource>
  return typeof body === 'string' && body.length > 0 &&
    typeof size === 'number' && Number.isFinite(size) && size > 0 && size <= MAX_SIZE
}

function readStored(now: number): StoredSources | null {
  const raw = safeGetItem(ICON_BODY_CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSources> | null
    const savedAt = parsed?.savedAt
    const sources = parsed?.sources
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null
    if (savedAt > now + MAX_CLOCK_LEAD_MS || now - savedAt > ICON_BODY_TTL_MS) return null
    if (!sources || typeof sources !== 'object') return null
    return { savedAt, sources: sources as Record<string, IconSource> }
  } catch {
    return null
  }
}

// Corrupt, foreign, stale, or orphaned entries all degrade to a cache miss.
export function readCachedIconBodies(now = Date.now()): Record<string, IconSource> {
  const stored = readStored(now)
  if (!stored) return {}
  const cached: Record<string, IconSource> = {}
  for (const [id, source] of Object.entries(stored.sources)) {
    if (CURATED_IDS.has(id) && isIconSource(source)) cached[id] = source
  }
  return cached
}

// Merges so a partial batch accumulates instead of replacing good entries, and
// a failed one (nothing to store) leaves the cache untouched.
export function writeCachedIconBodies(sources: Record<string, IconSource>, now = Date.now()): void {
  const curated: Record<string, IconSource> = {}
  for (const [id, source] of Object.entries(sources)) {
    if (CURATED_IDS.has(id) && isIconSource(source)) curated[id] = source
  }
  if (Object.keys(curated).length === 0) return
  const cached = readCachedIconBodies(now)
  // Every search would otherwise re-serialize the same ~55 KB blob.
  const unchanged = Object.entries(curated)
    .every(([id, source]) => cached[id]?.body === source.body && cached[id]?.size === source.size)
  if (unchanged) return
  safeSetItem(ICON_BODY_CACHE_KEY, JSON.stringify({ savedAt: now, sources: { ...cached, ...curated } }))
}
