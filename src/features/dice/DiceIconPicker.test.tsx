import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { DiceIconPicker, DIE_SIDES, type DiceSelection } from './DiceIconPicker'

function Harness({ initial, maxTotal, disabled }: { initial: DiceSelection[]; maxTotal?: number; disabled?: boolean }) {
  const [selection, setSelection] = useState(initial)
  return <DiceIconPicker selection={selection} onChange={setSelection} maxTotal={maxTotal} disabled={disabled} />
}

describe('DiceIconPicker', () => {
  it('renders one button per die size and no Clear (the parent owns it)', () => {
    render(<Harness initial={[]} />)

    for (const sides of DIE_SIDES) {
      expect(screen.getByRole('button', { name: `Add d${sides}` })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: 'Clear dice' })).not.toBeInTheDocument()
  })

  it('adds a die and increments it on repeat taps', () => {
    render(<Harness initial={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))
    expect(screen.getByRole('button', { name: 'Add d8' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('dice-count-d8')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))
    expect(screen.getByTestId('dice-count-d8')).toHaveTextContent('2')
  })

  it('keeps several different dice selected at once', () => {
    render(<Harness initial={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))

    expect(screen.getByRole('button', { name: 'Add d6' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add d8' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('dice-count-d6')).toHaveTextContent('2')
    expect(screen.getByTestId('dice-count-d8')).toHaveTextContent('1')
  })

  it('never renders a Clear button, even with a selection (#697)', () => {
    render(<Harness initial={[{ sides: 6, count: 2 }, { sides: 8, count: 1 }]} />)

    expect(screen.queryByRole('button', { name: 'Clear dice' })).not.toBeInTheDocument()
  })

  it('caps the total number of dice at maxTotal', () => {
    render(<Harness initial={[{ sides: 6, count: 2 }]} maxTotal={3} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    expect(screen.getByTestId('dice-count-d6')).toHaveTextContent('3')

    // At the cap, every die button is disabled and further taps are ignored.
    expect(screen.getByRole('button', { name: 'Add d8' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    expect(screen.getByTestId('dice-count-d6')).toHaveTextContent('3')
  })

  it('ignores taps while disabled', () => {
    render(<Harness initial={[]} disabled />)

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))

    expect(screen.getByRole('button', { name: 'Add d6' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Add d6' })).toBeDisabled()
  })
})
