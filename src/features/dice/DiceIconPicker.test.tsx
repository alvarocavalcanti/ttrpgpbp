import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { describe, it, expect } from 'vitest'
import { DiceIconPicker, DIE_SIDES, type DiceSelection } from './DiceIconPicker'

function Harness({ initial, maxCount, disabled, countDisabled }: { initial: DiceSelection; maxCount?: number; disabled?: boolean; countDisabled?: boolean }) {
  const [value, setValue] = useState(initial)
  return <DiceIconPicker value={value} onChange={setValue} maxCount={maxCount} disabled={disabled} countDisabled={countDisabled} />
}

describe('DiceIconPicker', () => {
  it('renders one button per die size and no stepper without a selection', () => {
    render(<Harness initial={{ sides: 20, count: 0 }} />)

    for (const sides of DIE_SIDES) {
      expect(screen.getByRole('button', { name: `Add d${sides}` })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /^Increase / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear dice' })).not.toBeInTheDocument()
  })

  it('selects a die and increments it on repeat taps', () => {
    render(<Harness initial={{ sides: 20, count: 1 }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))
    expect(screen.getByRole('button', { name: 'Add d8' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add d20' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Add d8' }))
    expect(screen.getByTestId('dice-count-d8')).toHaveTextContent('2')
  })

  it('switching die type resets the count to one', () => {
    render(<Harness initial={{ sides: 6, count: 3 }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add d10' }))

    expect(screen.getByRole('button', { name: 'Add d10' })).toHaveAttribute('aria-pressed', 'true')
    // d6 is deselected and its count is gone.
    expect(screen.queryByTestId('dice-count-d6')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decrease d10' })).toBeInTheDocument()
  })

  it('steps the count down to zero, which clears the selection', () => {
    render(<Harness initial={{ sides: 6, count: 2 }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Decrease d6' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease d6' }))

    expect(screen.queryByRole('button', { name: /^Increase / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add d6' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clears the selection', () => {
    render(<Harness initial={{ sides: 20, count: 5 }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear dice' }))

    expect(screen.queryByRole('button', { name: 'Clear dice' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add d20' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clamps the count to maxCount at the point of input', () => {
    render(<Harness initial={{ sides: 6, count: 2 }} maxCount={3} />)

    fireEvent.click(screen.getByRole('button', { name: 'Increase d6' }))
    expect(screen.getByTestId('dice-count-d6')).toHaveTextContent('3')
    expect(screen.getByRole('button', { name: 'Increase d6' })).toBeDisabled()
  })

  it('ignores taps while disabled', () => {
    render(<Harness initial={{ sides: 20, count: 1 }} disabled />)

    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))

    expect(screen.getByRole('button', { name: 'Add d6' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Add d6' })).toBeDisabled()
  })

  it('countDisabled locks the count controls but still allows switching die type', () => {
    render(<Harness initial={{ sides: 20, count: 1 }} countDisabled />)

    // The current die's count controls are locked...
    expect(screen.getByRole('button', { name: 'Add d20' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Increase d20' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear dice' })).toBeDisabled()

    // ...but another die type can still be picked, moving the selection away.
    fireEvent.click(screen.getByRole('button', { name: 'Add d6' }))
    expect(screen.getByRole('button', { name: 'Add d6' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add d20' })).toHaveAttribute('aria-pressed', 'false')
  })
})
