import { useState, useRef, useEffect } from 'react'
import { QUICK_EMOJIS } from './emojis'

interface EmojiPickerProps {
  onPick: (emoji: string) => void
  /** Controlled open state; when provided the trigger button is hidden and the
   *  picker opens/closes externally (e.g. from a message action). Requires
   *  `onOpenChange` so the parent can close it. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function EmojiPicker({ onPick, open, onOpenChange }: EmojiPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen = open ?? internalOpen
  const setOpen = (v: boolean) => {
    // In controlled mode the parent owns visibility; keep internal state dead
    // so a later `open` flip doesn't fight a stale internal write.
    if (open === undefined) setInternalOpen(v)
    onOpenChange?.(v)
  }
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative inline-block">
      {open === undefined && (
        <button
          type="button"
          aria-label="Add reaction"
          aria-expanded={isOpen}
          onClick={() => setOpen(!isOpen)}
          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}
      {isOpen && (
        <div className="absolute bottom-full mb-1 left-0 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-2 grid grid-cols-8 gap-1 w-64">
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setOpen(false)
                onPick(emoji)
              }}
              className="hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1.5 text-lg leading-none"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
