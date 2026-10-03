import { useState } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NumericInput } from './NumericInput'

function Harness({ initial = 1, min = 1, max = 100 }: { initial?: number; min?: number; max?: number }) {
  const [value, setValue] = useState(initial)
  return <NumericInput id="field" value={value} onChange={setValue} min={min} max={max} aria-label="Number" />
}

describe('NumericInput', () => {
  afterEach(cleanup)

  it('commits a new single digit after clearing the field', () => {
    render(<Harness initial={1} />)
    const input = screen.getByLabelText('Number') as HTMLInputElement

    fireEvent.change(input, { target: { value: '' } })
    expect(input).toHaveValue(null)

    fireEvent.change(input, { target: { value: '6' } })
    expect(input).toHaveValue(6)
  })

  it('restores the last committed value on blur when left empty', () => {
    render(<Harness initial={3} />)
    const input = screen.getByLabelText('Number') as HTMLInputElement

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(input).toHaveValue(3)
  })

  it('clamps typed values to the bounds as they are entered', () => {
    const onChange = vi.fn()
    render(<NumericInput id="field" value={1} onChange={onChange} min={1} max={100} aria-label="Number" />)
    const input = screen.getByLabelText('Number') as HTMLInputElement

    fireEvent.change(input, { target: { value: '9999' } })
    expect(onChange).toHaveBeenLastCalledWith(100)
    expect(input).toHaveValue(100)

    fireEvent.change(input, { target: { value: '0' } })
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(input).toHaveValue(1)

    fireEvent.change(input, { target: { value: '-5' } })
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(input).toHaveValue(1)
  })

  it('does not commit partial input such as a lone minus', () => {
    const onChange = vi.fn()
    render(<NumericInput id="field" value={0} onChange={onChange} min={-999} max={999} aria-label="Modifier" />)
    const input = screen.getByLabelText('Modifier')

    fireEvent.change(input, { target: { value: '-' } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '-2' } })
    expect(onChange).toHaveBeenLastCalledWith(-2)
  })

  it('rejects decimal and exponent input instead of showing it', () => {
    const onChange = vi.fn()
    render(<NumericInput id="field" value={4} onChange={onChange} min={1} max={100} aria-label="Number" />)
    const input = screen.getByLabelText('Number') as HTMLInputElement

    fireEvent.change(input, { target: { value: '9.5' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue(4)

    fireEvent.change(input, { target: { value: '1e3' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue(4)
  })

  it('syncs the displayed text when the value changes externally', () => {
    const { rerender } = render(
      <NumericInput id="field" value={1} onChange={vi.fn()} min={1} max={100} aria-label="Number" />,
    )
    const input = screen.getByLabelText('Number') as HTMLInputElement
    expect(input).toHaveValue(1)

    rerender(<NumericInput id="field" value={7} onChange={vi.fn()} min={1} max={100} aria-label="Number" />)
    expect(input).toHaveValue(7)
  })

  it('renders a numeric spinbutton', () => {
    render(<NumericInput id="field" value={1} onChange={vi.fn()} min={1} max={100} aria-label="Number" />)
    const input = screen.getByLabelText('Number')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByRole('spinbutton')).toBe(input)
  })
})
