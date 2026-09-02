import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ModifierInput } from './ModifierInput'

describe('ModifierInput', () => {
  afterEach(cleanup)

  const setup = (value = '0') => {
    const onChange = vi.fn()
    render(<ModifierInput attr="STR" value={value} onChange={onChange} min={-4} max={4} />)
    return onChange
  }

  it('decrements and increments within bounds', () => {
    const onChange = setup('2')
    fireEvent.click(screen.getByRole('button', { name: 'Decrease STR' }))
    expect(onChange).toHaveBeenLastCalledWith('1')
    fireEvent.click(screen.getByRole('button', { name: 'Increase STR' }))
    expect(onChange).toHaveBeenLastCalledWith('3')
  })

  it('clamps stepping to the bounds', () => {
    const onChange = setup('4')
    fireEvent.click(screen.getByRole('button', { name: 'Increase STR' }))
    expect(onChange).toHaveBeenLastCalledWith('4')
    cleanup()

    const onChangeMin = setup('-4')
    fireEvent.click(screen.getByRole('button', { name: 'Decrease STR' }))
    expect(onChangeMin).toHaveBeenLastCalledWith('-4')
  })

  it('steps from 0 when value is invalid or empty', () => {
    const onChange = setup('1e+79')
    fireEvent.click(screen.getByRole('button', { name: 'Increase STR' }))
    expect(onChange).toHaveBeenLastCalledWith('1')
    cleanup()

    const onChangeEmpty = setup('')
    fireEvent.click(screen.getByRole('button', { name: 'Decrease STR' }))
    expect(onChangeEmpty).toHaveBeenLastCalledWith('-1')
  })

  it('flags out-of-range typed values and passes typing through', () => {
    const onChange = setup('0')
    const input = screen.getByRole('textbox')
    expect(input).not.toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(input, { target: { value: '16' } })
    expect(onChange).toHaveBeenLastCalledWith('16')
  })

  it('renders the value input with numeric keypad hint', () => {
    setup()
    expect(screen.getByRole('textbox')).toHaveAttribute('inputmode', 'numeric')
  })

  it('stacks the input above the buttons on mobile and flanks them on sm+', () => {
    setup()
    const input = screen.getByRole('textbox')
    // Mobile: input leads (order-first) and the buttons sit together in a row below.
    expect(input).toHaveClass('order-first', 'w-full')
    const buttonRow = screen.getByRole('button', { name: 'Decrease STR' }).closest('div')
    expect(buttonRow).toHaveClass('flex')
    // sm+: wrapper dissolves back into the flanking row, minus button leads.
    expect(buttonRow).toHaveClass('sm:contents')
    expect(screen.getByRole('button', { name: 'Decrease STR' })).toHaveClass('sm:order-first')
  })
})
