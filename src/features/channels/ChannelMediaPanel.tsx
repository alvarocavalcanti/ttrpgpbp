import { useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { SignedImg } from '../../components/SignedImg'
import { ImageViewerModal } from '../../components/ImageViewerModal'
import { useChannelMedia } from '../../hooks/useChannelMedia'

interface ChannelMediaPanelProps {
  channelId: string
  isGM: boolean
  /** GM only: append one `![](path)` line per path at the composer cursor. */
  onInsert: (paths: string[]) => void
  onClose: () => void
}

// Channel Media browser (#465). Everyone can browse the channel's message
// images and open one fullscreen; the GM can additionally multi-select and
// insert them into the composer. No delete, no upload from here.
export function ChannelMediaPanel({ channelId, isGM, onInsert, onClose }: ChannelMediaPanelProps) {
  const { items, loading, error, refetch } = useChannelMedia(channelId)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewing, setViewing] = useState<{ src: string; alt: string } | null>(null)

  const toggle = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const insertSelected = () => {
    const paths = items.filter(i => selected.has(i.path)).map(i => i.path)
    if (paths.length) onInsert(paths)
    onClose()
  }

  return (
    <>
      <BottomSheet title="Channel Media" onClose={onClose}>
        {loading && (
          <div className="flex justify-center py-10">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-indigo-800 dark:border-t-indigo-400"
              role="status"
              aria-label="Loading channel media"
            />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
            <p className="text-sm text-red-700 dark:text-red-400">Couldn't load channel media.</p>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center justify-center min-h-11 rounded-md border border-red-300 dark:border-red-700 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No images yet. Images the GM uploads to this channel will show up here.
          </p>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {items.map(item => (
              <div key={item.path} className="relative">
                <button
                  type="button"
                  onClick={() => setViewing({ src: item.path, alt: 'Channel image' })}
                  aria-label="View image fullscreen"
                  className="block w-full rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <SignedImg
                    src={item.path}
                    alt=""
                    className="aspect-square w-full rounded-md object-cover bg-gray-100 dark:bg-gray-700"
                  />
                </button>
                {isGM && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected.has(item.path)}
                    aria-label={`Select ${item.name}`}
                    onClick={() => toggle(item.path)}
                    className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold shadow-sm ${
                      selected.has(item.path)
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-gray-300 bg-white/80 text-transparent dark:border-gray-600 dark:bg-gray-800/80'
                    }`}
                  >
                    ✓
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {isGM && !loading && !error && items.length > 0 && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={insertSelected}
              disabled={selected.size === 0}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {selected.size > 0 ? `Insert (${selected.size})` : 'Insert'}
            </button>
          </div>
        )}
      </BottomSheet>

      {viewing && (
        <ImageViewerModal src={viewing.src} alt={viewing.alt} onClose={() => setViewing(null)} />
      )}
    </>
  )
}
