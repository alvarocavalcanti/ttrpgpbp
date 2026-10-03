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
    // Only the empty field (so it can be retyped) and a lone minus (the
    // modifier's transient sign) are kept as-is. Decimals and exponent
    // notation are rejected at the keystroke instead of showing text that
    // silently disagrees with the committed value.
    if (raw === '' || raw === '-') {
      setText(raw)
      return
    }
    if (!INTEGER.test(raw)) return
    // Normalize the text to the clamped value so an out-of-range entry (0,
    // 9999) can't display a number that differs from the one that rolls.
    const clamped = Math.min(max, Math.max(min, parseInt(raw, 10)))
    setText(String(clamped))
    onChange(clamped)
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
