import { useEffect, useRef, useState } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import { useEscapeToClose } from '../hooks/useEscapeToClose'

export interface MenuOption {
  value: string
  label: string
  hint?: string
}

interface MenuProps {
  icon?: React.ReactNode
  label: string
  value: string
  options: MenuOption[]
  onSelect: (value: string) => void
  dropUp?: boolean
}

// A labelled chip that opens a dropdown menu of options. The current selection
// is shown alongside the label so the control is never a bare icon.
export function Menu({ icon, label, value, options, onSelect, dropUp = true }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useClickOutside<HTMLDivElement>(() => setOpen(false), open)
  const listRef = useRef<HTMLDivElement>(null)
  useEscapeToClose(() => setOpen(false))

  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (open) setHighlighted(0)
  }, [open])

  const move = (dir: 1 | -1) => {
    setHighlighted(i => (i + dir + options.length) % options.length)
  }

  const choose = (index: number) => {
    onSelect(options[index].value)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(highlighted) }
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={handleKeyDown}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
      >
        {icon && <span className="text-indigo-500 dark:text-indigo-400 flex-shrink-0">{icon}</span>}
        <span className="text-left">
          <span className="block font-medium leading-tight">{label}</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400 leading-tight">
            {selected ? selected.label : 'Select…'}
          </span>
        </span>
        <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          className={`absolute ${dropUp ? 'bottom-full mb-2' : 'top-full mt-2'} left-0 w-64 max-h-72 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 py-1`}
        >
          {options.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={opt.value === value}
              onClick={() => choose(i)}
              onMouseEnter={() => setHighlighted(i)}
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 ${
                i === highlighted ? 'bg-indigo-50 dark:bg-indigo-950' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span className="min-w-0">
                <span className={`block truncate ${opt.value === value ? 'font-medium text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-100'}`}>{opt.label}</span>
                {opt.hint && <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">{opt.hint}</span>}
              </span>
              {opt.value === value && (
                <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
