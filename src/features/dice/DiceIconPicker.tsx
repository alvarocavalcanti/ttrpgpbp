// Dice bag for the roller (#629): tap a die to add one, tap again to add more.
// Presentational only — the parent owns the selection (and the Clear action)
// so the roller's notation builder stays the source of truth. Clear lives in
// the parent's control row (#697) so it never shifts the form.
import { DieIcon } from './diceIcons'

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

export function DieGlyph({ className }: { className?: string }) {
  return <DieIcon sides={20} className={className} />
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
              <DieIcon sides={sides} className="h-6 w-6" />
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
    </div>
  )
}
