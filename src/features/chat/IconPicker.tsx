import { useRef, useState, useEffect } from 'react'
import { CURATED_NPC_ICONS, npcIconUrl } from './npcIcons'
import { useDebounce } from '../../hooks/useDebounce'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { reportAppError } from '../../lib/appErrorLog'
import { readCachedIconBodies, writeCachedIconBodies, type IconSource } from './iconSourceCache'

interface IconPickerProps {
  onPick: (iconUrl: string) => void
  onClose: () => void
}

interface IconifySearchResult {
  icons: string[]
}

interface IconifyCollectionResult {
  width?: unknown
  height?: unknown
  icons?: Record<string, { body?: unknown; width?: unknown; height?: unknown }>
}

const GAME_ICONS_PREFIX = 'game-icons:'
const GAME_ICONS_COLLECTION_URL = 'https://api.iconify.design/game-icons.json'
const DEFAULT_ICON_SIZE = 512

// Iconify's per-icon image endpoint rate-limits bursts (#835): a second search
// requested ~48 new .svg URLs at once, tripped the limiter, and every tile came
// back 429 (no-store, so nothing recovered for ~2 minutes). Previews now render
// from the collection payload instead, one request per displayed set.
function iconSvgDataUrl({ body, size }: IconSource): string {
  // xmlns is required for an SVG painted through <img>; without it the tile
  // renders blank, which is indistinguishable from the bug this fixes.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function buildDataUrls(sources: Record<string, IconSource>, ids: readonly string[]): Record<string, string> {
  const urls: Record<string, string> = {}
  for (const id of ids) {
    const source = sources[id]
    if (source) urls[id] = iconSvgDataUrl(source)
  }
  return urls
}

function toSize(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 4096 ? value : null
}

// One request for the whole set. Never throws: a failed batch degrades to the
// plain image URLs the caller already falls back to.
// shortcut: single GET query string, revisit only if the search limit grows past ~100 ids.
export async function fetchIconSources(
  ids: string[],
  signal?: AbortSignal,
): Promise<Record<string, IconSource>> {
  if (ids.length === 0) return {}
  const sources: Record<string, IconSource> = {}
  try {
    const res = await fetch(`${GAME_ICONS_COLLECTION_URL}?icons=${ids.map(encodeURIComponent).join(',')}`, { signal })
    const data = (await res.json()) as IconifyCollectionResult
    const collectionSize = toSize(data?.width) ?? toSize(data?.height) ?? DEFAULT_ICON_SIZE
    for (const id of ids) {
      const icon = data?.icons?.[id]
      if (typeof icon?.body !== 'string' || !icon.body) continue
      sources[id] = {
        body: icon.body,
        size: toSize(icon.width) ?? toSize(icon.height) ?? collectionSize,
      }
    }
  } catch {
    return {}
  }
  return sources
}

// Iconify /search returns collection-namespaced names ("game-icons:dragon-head")
// even when the request pins prefix=game-icons, while npcIconUrl expects a bare
// id — concatenating the namespaced form produced 404s (#811). Bare names stay
// accepted, and results from other collections are dropped rather than stripped,
// because `mdi:sword` would otherwise render an unrelated icon.
export function toGameIconIds(names: string[]): { ids: string[]; ignored: string[] } {
  const ids: string[] = []
  const ignored: string[] = []
  for (const name of names) {
    if (typeof name !== 'string' || !name) continue
    if (name.startsWith(GAME_ICONS_PREFIX)) {
      const id = name.slice(GAME_ICONS_PREFIX.length)
      if (id) ids.push(id)
    } else if (!name.includes(':')) {
      ids.push(name)
    } else {
      ignored.push(name)
    }
  }
  return { ids, ignored }
}

// Diagnostics survive the tab closing only through app_error_log, whose RPC
// clamps messages to 500 chars and stores no user-authored text. The search
// term is never logged at all: Sentry turns console output into breadcrumbs
// that ride along with the error event this code reports, so it would leave
// the device that way. One row per failure kind per page load keeps a wedged
// client from crowding out real errors (the RPC itself caps at 20 rows/minute).
let mismatchReported = false
let malformedPayloadReported = false

function reportDroppedResults(ignored: string[], kept: number): void {
  const prefixes = [...new Set(ignored.map(name => name.split(':')[0]))].slice(0, 5)
  console.warn('[npc-icon-search] ignored non-game-icons results', {
    ignored: ignored.length,
    kept,
    prefixes,
  })
  if (mismatchReported) return
  mismatchReported = true
  reportAppError(new Error(
    `[npc-icon-search] ignored ${ignored.length} non-game-icons results ` +
    `(prefixes: ${prefixes.join(',') || 'none'}; kept ${kept}; total ${ignored.length + kept})`
  ))
}

function reportMalformedPayload(): void {
  if (malformedPayloadReported) return
  malformedPayloadReported = true
  reportAppError(new Error('[npc-icon-search] Iconify search payload missing icons array'))
}

function filteredCurated(query: string): string[] {
  const needle = query.toLowerCase().replace(/\s+/g, '-')
  return CURATED_NPC_ICONS.filter(name => name.includes(needle))
}

// Search game-icons.net via the Iconify API; fall back to the curated subset
// on network failure or empty results.
async function searchIconIds(trimmed: string, signal: AbortSignal): Promise<string[]> {
  const res = await fetch(
    `https://api.iconify.design/search?query=${encodeURIComponent(trimmed)}&prefix=game-icons&limit=48`,
    { signal },
  )
  const data = (await res.json()) as IconifySearchResult
  if (!Array.isArray(data?.icons)) {
    console.warn('[npc-icon-search] unexpected Iconify payload', data)
    reportMalformedPayload()
    return filteredCurated(trimmed)
  }
  const { ids, ignored } = toGameIconIds(data.icons)
  if (ignored.length > 0) reportDroppedResults(ignored, ids.length)
  return ids
}

export function IconPicker({ onPick, onClose }: IconPickerProps) {
  const [query, setQuery] = useState('')
  // Debounced so typing doesn't fire an Iconify request per keystroke (ARCH-2).
  const debouncedQuery = useDebounce(query, 300)
  // Curated bodies are cached for a week (#835), so a warm modal paints its
  // grid with no request at all and never goes blank during a rate-limit window.
  const [cachedBodies] = useState(() => readCachedIconBodies())
  const bodiesRef = useRef<Record<string, IconSource>>(cachedBodies)
  const [sources, setSources] = useState<Record<string, string>>(
    () => buildDataUrls(cachedBodies, CURATED_NPC_ICONS),
  )
  const [icons, setIcons] = useState<string[]>([...CURATED_NPC_ICONS])
  const [loading, setLoading] = useState(() => !CURATED_NPC_ICONS.every(id => id in cachedBodies))
  const dialogRef = useRef<HTMLDivElement>(null)

  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    const controller = new AbortController()
    // A superseded query (or an unmount) rejects later; the flag keeps that
    // stale rejection from overwriting the results of the live request.
    let active = true

    const commit = (ids: string[]) => {
      setIcons(ids)
      setSources(buildDataUrls(bodiesRef.current, ids))
      setLoading(false)
    }

    const load = async () => {
      let ids: string[]
      if (!trimmed) {
        ids = [...CURATED_NPC_ICONS]
      } else {
        setLoading(true)
        try {
          ids = await searchIconIds(trimmed, controller.signal)
        } catch {
          // Fall back to curated subset on failure.
          if (!active) return
          ids = filteredCurated(trimmed)
        }
        if (!active) return
      }

      const missing = ids.filter(id => !bodiesRef.current[id])
      if (missing.length === 0) {
        commit(ids)
        return
      }
      if (!trimmed) setLoading(true)
      const fetched = await fetchIconSources(missing, controller.signal)
      if (!active) return
      if (Object.keys(fetched).length > 0) {
        bodiesRef.current = { ...bodiesRef.current, ...fetched }
        writeCachedIconBodies(bodiesRef.current)
      }
      commit(ids)
    }

    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [debouncedQuery])

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="icon-picker-title">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div aria-hidden="true" className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 transition-opacity" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 id="icon-picker-title" className="text-lg font-medium text-gray-900 dark:text-gray-100">Choose NPC Portrait</h3>
            <button type="button" onClick={onClose} className="text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400" aria-label="Close">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons (e.g. dragon, skull)..."
            aria-label="Search icons"
            className="bg-white dark:bg-gray-800 w-full border-gray-300 dark:border-gray-600 rounded-md text-sm py-2 px-3 mb-3 focus:ring-indigo-500 focus:border-indigo-500 border"
            autoFocus
          />
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
              </div>
            ) : icons.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No icons found.</div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {icons.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onPick(npcIconUrl(name))}
                    className="aspect-square flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors"
                    title={name}
                    aria-label={name}
                  >
                    <img className="h-8 w-8 dark:invert" src={sources[name] ?? npcIconUrl(name)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-400 dark:text-gray-400">
            Icons from game-icons.net (CC BY 3.0)
          </p>
        </div>
      </div>
    </div>
  )
}
