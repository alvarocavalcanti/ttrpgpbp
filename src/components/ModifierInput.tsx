// Bounded modifier input with −/+ stepper buttons flanking the field.
// iOS has no signed numeric keypad, so tapping steps through the valid
// range without a keyboard; direct typing still works (desktop, or
// Bluetooth keyboard) and keeps the out-of-range red styling upstream.
interface ModifierInputProps {
  attr: string
  value: string
  onChange: (value: string) => void
  min: number
  max: number
}

export function ModifierInput({ attr, value, onChange, min, max }: ModifierInputProps) {
  // Invalid or empty text steps from 0.
  const current = /^-?\d+$/.test(value) ? parseInt(value, 10) : 0
  const step = (delta: number) => onChange(String(Math.min(Math.max(current + delta, min), max)))
  const invalid = /^-?\d+$/.test(value) && (current < min || current > max)

  const btnClass =
    'shrink-0 w-8 h-8 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium leading-none'

  return (
    <div className="flex items-center gap-1 mt-1">
      <button
        type="button"
        aria-label={`Decrease ${attr}`}
        onClick={() => step(-1)}
        className={btnClass}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        id={attr}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        pattern="-?[0-9]*"
        aria-invalid={invalid}
        className={`w-full min-w-0 rounded-md shadow-sm sm:text-sm px-1 py-2 border text-center bg-white dark:bg-gray-800 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
          invalid
            ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      />
      <button
        type="button"
        aria-label={`Increase ${attr}`}
        onClick={() => step(1)}
        className={btnClass}
      >
        +
      </button>
    </div>
  )
}
