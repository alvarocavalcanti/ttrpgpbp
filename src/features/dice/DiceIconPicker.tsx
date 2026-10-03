// Icon grid for picking a die type and a quantity (#629). Presentational only:
// the parent owns the selection state so the roller's notation builder stays
// the single source of truth.

// The die sizes the roller form can render. Anything else the server accepts
// (d30, d1000, …) can't be shown as an icon.
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const

export interface DiceSelection {
  sides: number
  count: number
}

interface DiceIconPickerProps {
  value: DiceSelection
  onChange: (next: DiceSelection) => void
  maxCount?: number
  disabled?: boolean
  // Locks only the count controls — e.g. while d20 Adv/Dis is active — so the
  // player can still switch die type or clear instead of getting stuck.
  countDisabled?: boolean
}

// Shared die glyph for the picker buttons and the floating trigger.
export function DieGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="3" strokeWidth={2} />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function DiceIconPicker({ value, onChange, maxCount = 100, disabled = false, countDisabled = false }: DiceIconPickerProps) {
  const clamp = (n: number) => Math.min(maxCount, Math.max(0, n))
  const hasSelection = value.count > 0

  const select = (sides: number) => {
    if (disabled || (countDisabled && value.sides === sides)) return
    const count = value.sides === sides ? clamp(value.count + 1) : 1
    onChange({ sides, count })
  }

  const step = (delta: number) => {
    if (disabled || countDisabled) return
    onChange({ sides: value.sides, count: clamp(value.count + delta) })
  }

  return (
    <div role="group" aria-label="Dice" className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {DIE_SIDES.map((sides) => {
          const isSelected = hasSelection && value.sides === sides
          return (
            <button
              key={sides}
              type="button"
              onClick={() => select(sides)}
              disabled={disabled || (countDisabled && value.sides === sides)}
              aria-pressed={isSelected}
              aria-label={`Add d${sides}`}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-11 py-1 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                  : 'border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700'
              }`}
            >
              <DieGlyph className="h-6 w-6" />
              <span className="text-xs font-medium">{`d${sides}`}</span>
              {isSelected && value.count > 1 && (
                <span
                  data-testid={`dice-count-d${sides}`}
                  className="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary-600 px-1 text-center text-[0.625rem] font-bold text-white"
                >
                  {value.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {hasSelection && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={disabled || countDisabled}
              aria-label={`Decrease d${value.sides}`}
              className="min-h-11 min-w-11 py-2 border border-surface-300 dark:border-surface-600 rounded text-surface-700 dark:text-surface-300 text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-700 disabled:opacity-50"
            >
              −
            </button>
            <span aria-live="polite" className="min-w-8 text-center text-sm text-surface-900 dark:text-surface-100">
              {value.count}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={disabled || countDisabled || value.count >= maxCount}
              aria-label={`Increase d${value.sides}`}
              className="min-h-11 min-w-11 py-2 border border-surface-300 dark:border-surface-600 rounded text-surface-700 dark:text-surface-300 text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-700 disabled:opacity-50"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChange({ sides: value.sides, count: 0 })}
            disabled={disabled || countDisabled}
            aria-label="Clear dice"
            className="min-h-11 py-2 px-3 text-sm font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
