import { useState, useRef, useEffect } from 'react'
import { QUICK_EMOJIS } from './emojis'

interface EmojiPickerProps {
  onPick: (emoji: string) => void
}

export function EmojiPicker({ onPick }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-label="Add reaction"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1">
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setOpen(false)
                onPick(emoji)
              }}
              className="hover:bg-gray-100 rounded p-1 text-lg leading-none"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
