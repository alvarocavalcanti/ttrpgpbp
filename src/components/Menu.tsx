import { useEffect, useState } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import { useEscapeToClose } from '../hooks/useEscapeToClose'
import { BottomSheet } from './BottomSheet'
import { chipBase, chipIdle, chipActive } from '../features/chat/composerChip'

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
  popup?: boolean
  // Highlights the trigger when the menu holds an active (non-default) choice.
  active?: boolean
}

// A chip that opens the options as a popup (bottom sheet) on small screens, or
// an anchored dropdown elsewhere. The current selection is shown inline so the
// control is never a bare icon, and the trigger matches the composer's chips.
export function Menu({ icon, label, value, options, onSelect, popup = false, active = false }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useClickOutside<HTMLDivElement>(() => setOpen(false), open)
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

  // Shared option buttons — rendered inside the BottomSheet (popup) or the
  // anchored dropdown container, so both variants list identical items.
  const optionButtons = options.map((opt, i) => (
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
        {opt.hint && <span className="block text-xs text-gray-400 dark:text-gray-400 truncate">{opt.hint}</span>}
      </span>
      {opt.value === value && (
        <svg className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  ))
  const optionsMenu = <div role="menu" aria-label={label} className="py-1">{optionButtons}</div>

  return (
    <div ref={containerRef} className="relative flex shrink-0">
      <button
        type="button"
        aria-haspopup={popup ? 'dialog' : 'menu'}
        aria-expanded={open}
        onKeyDown={handleKeyDown}
        onClick={() => setOpen(o => !o)}
        className={`${chipBase} ${active ? chipActive : chipIdle}`}
      >
        {icon && <span className="inline-flex flex-shrink-0">{icon}</span>}
        <span className="truncate max-w-[12rem]">
          {label}: {selected ? selected.label : 'Select…'}
        </span>
        <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && popup && (
        <BottomSheet title={label} onClose={() => setOpen(false)}>{optionsMenu}</BottomSheet>
      )}
      {open && !popup && (
        <div
          role="menu"
          aria-label={label}
          className="absolute bottom-full mb-2 left-0 w-64 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 py-1"
        >
          {optionButtons}
        </div>
      )}
    </div>
  )
}