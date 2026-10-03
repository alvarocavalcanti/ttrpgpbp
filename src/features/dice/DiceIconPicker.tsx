// Dice bag for the roller (#629): tap a die to add one, tap again to add
// more, and Clear wipes the whole selection. Presentational only — the parent
// owns the selection so the roller's notation builder stays the source of
// truth.

// The die sizes the roller can render. Anything else the server accepts
// (d30, d1000, …) can't be shown as an icon.
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const

export interface DiceSelection {
  sides: number
  count: number
}

interface DiceIconPickerProps {
  selection: DiceSelection[]
  onChange: (next: DiceSelection[]) => void
  disabled?: boolean
  maxTotal?: number
}

// Hand-drawn polyhedra so every die type is recognizable without pulling in an
// icon dependency or its attribution. game-icons.net has a full set but is
// CC BY 3.0 (attribution required) and Font Awesome free only covers d6/d20.
function DieShape({ sides }: { sides: number }) {
  switch (sides) {
    case 4:
      return (<>
        <path d="M12 3 L21 20 L3 20 Z" />
        <path d="M12 3 L12 14 M21 20 L12 14 M3 20 L12 14" />
      </>)
    case 6:
      return (<>
        <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
        <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      </>)
    case 8:
      return (<>
        <path d="M12 2 L21 12 L12 22 L3 12 Z" />
        <path d="M12 2 L12 22 M3 12 L21 12" />
      </>)
    case 10:
      return (<>
        <path d="M12 2 L20 9 L17 21 L7 21 L4 9 Z" />
        <path d="M12 2 L12 21 M4 9 L20 9" />
      </>)
    case 12:
      return (<>
        <path d="M12 2 L22 9.5 L18 21 L6 21 L2 9.5 Z" />
        <path d="M12 2 L12 21" />
      </>)
    case 100:
      return (<>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.5" />
      </>)
    default:
      return (<>
        <path d="M12 2 L20.7 7 L20.7 17 L12 22 L3.3 17 L3.3 7 Z" />
        <path d="M12 7 L16.5 16 L7.5 16 Z" />
      </>)
  }
}

export function DieGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <DieShape sides={20} />
    </svg>
  )
}

export function DiceIconPicker({ selection, onChange, disabled = false, maxTotal = 100 }: DiceIconPickerProps) {
  const total = selection.reduce((sum, die) => sum + die.count, 0)
  const countOf = (sides: number) => selection.find((die) => die.sides === sides)?.count ?? 0

  const add = (sides: number) => {
    if (disabled || total >= maxTotal) return
    const existing = selection.find((die) => die.sides === sides)
    onChange(existing
      ? selection.map((die) => (die.sides === sides ? { ...die, count: die.count + 1 } : die))
      : [...selection, { sides, count: 1 }])
  }

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Dice" className="grid grid-cols-4 gap-2">
        {DIE_SIDES.map((sides) => {
          const count = countOf(sides)
          return (
            <button
              key={sides}
              type="button"
              onClick={() => add(sides)}
              disabled={disabled || total >= maxTotal}
              aria-pressed={count > 0}
              aria-label={`Add d${sides}`}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-11 py-1 rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                count > 0
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300'
                  : 'border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700'
              }`}
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <DieShape sides={sides} />
              </svg>
              <span className="text-xs font-medium">{`d${sides}`}</span>
              {count > 0 && (
                <span
                  data-testid={`dice-count-d${sides}`}
                  className="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary-600 px-1 text-center text-[0.625rem] font-bold text-white"
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selection.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onChange([])}
            disabled={disabled}
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
