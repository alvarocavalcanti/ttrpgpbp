import { useState, useEffect } from 'react'
import { CURATED_NPC_ICONS, npcIconUrl } from './npcIcons'

interface IconPickerProps {
  onPick: (iconUrl: string) => void
  onClose: () => void
}

interface IconifySearchResult {
  icons: string[]
}

// Search game-icons.net via the Iconify API; fall back to the curated subset
// on network failure or empty results.
export function IconPicker({ onPick, onClose }: IconPickerProps) {
  const [query, setQuery] = useState('')
  const [icons, setIcons] = useState<string[]>([...CURATED_NPC_ICONS])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  useEffect(() => {
    if (!query.trim()) {
      setIcons([...CURATED_NPC_ICONS])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query.trim())}&prefix=game-icons&limit=48`, { signal: controller.signal })
      .then(res => res.json())
      .then((data: IconifySearchResult) => {
        setIcons(data.icons || [])
      })
      .catch(() => {
        // Fall back to curated subset on failure.
        setIcons(CURATED_NPC_ICONS.filter(n => n.includes(query.trim().toLowerCase().replace(/\s+/g, '-'))))
      })      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [query])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Choose NPC portrait">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Choose NPC Portrait</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons (e.g. dragon, skull)..."
            aria-label="Search icons"
            className="w-full border-gray-300 rounded-md text-sm py-2 px-3 mb-3 focus:ring-indigo-500 focus:border-indigo-500 border"
            autoFocus
          />
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : icons.length === 0 ? (
              <div className="text-center text-gray-500 py-8 text-sm">No icons found.</div>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {icons.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onPick(npcIconUrl(name))}
                    className="aspect-square flex items-center justify-center rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                    title={name}
                    aria-label={name}
                  >
                    <img className="h-8 w-8" src={npcIconUrl(name)} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Icons from game-icons.net (CC BY 3.0)
          </p>
        </div>
      </div>
    </div>
  )
}
