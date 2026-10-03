import { useState } from 'react'

// Bounded numeric field that stays editable while empty. A plain controlled
// `<input value={number}>` can't be cleared: onChange clamps the empty string
// straight back to the minimum, so a single digit can never be typed after
// deleting (#665). This keeps the raw text locally, commits only complete
// integers (clamped), and normalizes the text on blur.
interface NumericInputProps {
  id: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  className?: string
  disabled?: boolean
  'aria-label'?: string
}

const INTEGER = /^-?\d+$/

export function NumericInput({
  id,
  value,
  onChange,
  min,
  max,
  className,
  disabled,
  'aria-label': ariaLabel,
}: NumericInputProps) {
  const [text, setText] = useState(String(value))
  const [lastValue, setLastValue] = useState(value)

  // External writers (loading a history chip, clamping the target to the die
  // size) set the number; keep the visible text in sync with it. Adjusting
  // state during render is React's pattern for deriving from a changed prop.
  if (value !== lastValue) {
    setLastValue(value)
    setText(String(value))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setText(raw)
    if (!INTEGER.test(raw)) return
    onChange(Math.min(max, Math.max(min, parseInt(raw, 10))))
  }

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={handleChange}
      onBlur={() => setText(String(value))}
      className={className}
    />
  )
}
