import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiceRoller, buildNotation } from './DiceRoller'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

describe('buildNotation', () => {
  it('builds adv/dis notations', () => {
    expect(buildNotation('d20', 1, 0, 'adv')).toBe('2d20kh1')
    expect(buildNotation('d20', 1, 0, 'dis')).toBe('2d20kl1')
    expect(buildNotation('d20', 1, 0, 'none')).toBe('1d20')
  })

  it('appends modifiers with explicit sign', () => {
    expect(buildNotation('d6', 3, 2, 'none')).toBe('3d6+2')
    expect(buildNotation('d6', 3, -2, 'none')).toBe('3d6-2')
    expect(buildNotation('d6', 3, 0, 'none')).toBe('3d6')
  })
})

describe('DiceRoller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders and toggles open state', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    expect(screen.queryByText('Dice Roller')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    expect(screen.getByText('Dice Roller')).toBeInTheDocument()

    // Close button
    fireEvent.click(screen.getByRole('button', { name: 'Close dice roller' }))
    expect(screen.queryByText('Dice Roller')).not.toBeInTheDocument()
  })

  it('rolls a basic d20', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20')
  })

  it('changes quantity and dice type', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    const quantityInput = screen.getByDisplayValue('1')
    fireEvent.change(quantityInput, { target: { value: '3' } })

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'd8' } })

    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('3d8')
  })

  it('adds modifiers', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    // Change modifier (second number input)
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[1], { target: { value: '5' } })

    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20+5')
  })

  it('adds negative modifiers', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[1], { target: { value: '-2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20-2')
  })

  it('steps the modifier with +/- buttons for touch keyboards', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20+1')
  })

  it('applies advantage to d20', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Adv' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('2d20kh1')
  })

  it('applies disadvantage to d20', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Dis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('2d20kl1')
  })

  it('clamps quantity to 1-100 at the point of input', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    const quantityInput = screen.getByDisplayValue('1')
    fireEvent.change(quantityInput, { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('100d20')
  })

  it('clamps modifier to ±999 at the point of input', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[1], { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20+999')
  })

  it('uses a numeric keyboard for the quantity and modifier inputs', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    const inputs = screen.getAllByRole('spinbutton')
    expect(inputs[0]).toHaveAttribute('inputmode', 'numeric')
    expect(inputs[1]).toHaveAttribute('inputmode', 'numeric')
  })

  it('hides advantage controls for non-d20', () => {
    render(<DiceRoller onRoll={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    expect(screen.getByRole('button', { name: 'Adv' })).toBeInTheDocument()

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'd6' } })

    expect(screen.queryByRole('button', { name: 'Adv' })).not.toBeInTheDocument()
  })

  it('renders as a BottomSheet on mobile', () => {
    render(<DiceRoller popup onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    const dialog = screen.getByRole('dialog', { name: 'Dice Roller' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll' })).toBeInTheDocument()
  })

  it('does not render the anchored popup when popup is set', () => {
    render(<DiceRoller popup onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    expect(screen.queryByRole('button', { name: 'Close dice roller' })).not.toBeInTheDocument()
  })

  it('shows no quick-roll chips without a channel', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    expect(screen.queryByRole('button', { name: /Quick roll/ })).not.toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('fetches and shows the last 3 notations as quick-roll chips', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { id: '1', notation: '2d6+1', created_at: '2026-01-01T00:00:03Z' },
        { id: '2', notation: '1d20', notation2: undefined, created_at: '2026-01-01T00:00:02Z' } as any,
        { id: '3', notation: '2d6+1', created_at: '2026-01-01T00:00:01Z' },
        { id: '4', notation: '1d8', created_at: '2026-01-01T00:00:00Z' },
        { id: '3', notation: '1d4', created_at: '2026-01-01T00:00:00Z' }
      ],
      error: null
    } as any)

    const mockOnRoll = vi.fn()
    render(<DiceRoller channelId="c1" onRoll={mockOnRoll} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    expect(supabase.rpc).toHaveBeenCalledWith('get_channel_roll_history', { p_channel_id: 'c1' })
    await screen.findByRole('button', { name: 'Quick roll 1d8' })

    // Duplicate notations collapse; newest distinct 3 win, regardless of row order ties.
    expect(screen.getByRole('button', { name: 'Quick roll 2d6+1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quick roll 1d20' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Quick roll 1d4' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quick roll 2d6+1' }))
    expect(mockOnRoll).toHaveBeenCalledWith('2d6+1')
  })

  it('prepends the notation just rolled to the quick-roll chips', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller channelId="c1" onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20')

    // Reopen: the roll just made is now a chip.
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Quick roll 1d20' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20')
  })

  it('closes on Roll when rendered as a BottomSheet', () => {
    render(<DiceRoller popup channelId="c1" onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(screen.queryByRole('dialog', { name: 'Dice Roller' })).not.toBeInTheDocument()
  })
})