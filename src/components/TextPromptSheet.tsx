import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from './BottomSheet'

interface TextPromptSheetProps {
  title: string
  label: string
  maxLength: number
  initialValue?: string
  placeholder?: string
  confirmLabel: string
  onConfirm: (value: string) => void
  onClose: () => void
}

// One-field text prompt replacing window.prompt (UX #413): themed bottom
// sheet with the length cap enforced at input via native maxLength. Confirm
// returns the trimmed value; Cancel, Escape and backdrop tap all abort.
export function TextPromptSheet({ title, label, maxLength, initialValue = '', placeholder, confirmLabel, onConfirm, onClose }: TextPromptSheetProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  // The focus trap lands on the sheet's close button (first focusable), so
  // move focus to the input to open the mobile keyboard immediately.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <BottomSheet title={title} onClose={onClose}>
      <form
        onSubmit={(e) => { e.preventDefault(); onConfirm(value.trim()) }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="text-prompt-input" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {label}
          </label>
          <input
            ref={inputRef}
            id="text-prompt-input"
            type="text"
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            className="bg-white dark:bg-gray-800 mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {value.length}/{maxLength}
          </p>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 py-2 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </BottomSheet>
  )
}
