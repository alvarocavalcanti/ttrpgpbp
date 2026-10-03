import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DiceRoller, buildNotation, parseRollerNotation } from './DiceRoller'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

// The favorites hook is covered by its own tests; here it is a controllable
// stub so the chip tests can pin favorites without a DB.
const favoritesStub = vi.hoisted(() => ({
  favorites: [] as string[],
  toggleFavorite: vi.fn()
}))

vi.mock('./useDiceFavorites', () => ({
  useDiceFavorites: vi.fn(() => ({
    favorites: favoritesStub.favorites,
    isFavorite: (n: string) => favoritesStub.favorites.includes(n),
    canFavorite: favoritesStub.favorites.length < 3,
    toggleFavorite: favoritesStub.toggleFavorite
  }))
}))

// Taps the die `count` times in the icon picker.
function pickDie(sides: number, count = 1) {
  for (let i = 0; i < count; i++) {
    fireEvent.click(screen.getByRole('button', { name: `Add d${sides}` }))
  }
}

describe('buildNotation', () => {
  it('builds adv/dis notations for a single d20', () => {
    expect(buildNotation([{ sides: 20, count: 1 }], 0, 'adv')).toBe('2d20kh1')
    expect(buildNotation([{ sides: 20, count: 1 }], 0, 'dis')).toBe('2d20kl1')
    expect(buildNotation([{ sides: 20, count: 1 }], 0, 'none')).toBe('1d20')
  })

  it('chains different dice into one sum', () => {
    expect(buildNotation([{ sides: 6, count: 2 }, { sides: 8, count: 1 }], 3, 'none')).toBe('2d6+1d8+3')
  })

  it('appends modifiers with explicit sign', () => {
    expect(buildNotation([{ sides: 6, count: 3 }], 2, 'none')).toBe('3d6+2')
    expect(buildNotation([{ sides: 6, count: 3 }], -2, 'none')).toBe('3d6-2')
    expect(buildNotation([{ sides: 6, count: 3 }], 0, 'none')).toBe('3d6')
  })

  it('builds raw pool notations with no total', () => {
    expect(buildNotation([{ sides: 6, count: 5 }], 0, 'none', 'pool')).toBe('5d6p')
    // Pools drop keep/drop and modifiers: faces are read, not summed.
    expect(buildNotation([{ sides: 20, count: 1 }], 3, 'adv', 'pool')).toBe('1d20p')
  })

  it('builds success-count notations with the target', () => {
    expect(buildNotation([{ sides: 6, count: 5 }], 0, 'none', 'successes', 4)).toBe('5d6>=4')
    expect(buildNotation([{ sides: 10, count: 3 }], 0, 'none', 'successes', 8)).toBe('3d10>=8')
  })

  it('builds sorted pool notations when the sort flag is set', () => {
    expect(buildNotation([{ sides: 6, count: 5 }], 0, 'none', 'pool', 4, true)).toBe('5d6ps')
    expect(buildNotation([{ sides: 6, count: 5 }], 0, 'none', 'successes', 4, true)).toBe('5d6>=4s')
  })
})

describe('parseRollerNotation', () => {
  it('parses plain notations', () => {
    expect(parseRollerNotation('1d20')).toEqual({ selection: [{ sides: 20, count: 1 }], modifier: 0, advDis: 'none', poolMode: 'sum', target: 4, sorted: false })
    expect(parseRollerNotation('3d6+2')).toEqual({ selection: [{ sides: 6, count: 3 }], modifier: 2, advDis: 'none', poolMode: 'sum', target: 4, sorted: false })
    expect(parseRollerNotation('2d8-5')).toEqual({ selection: [{ sides: 8, count: 2 }], modifier: -5, advDis: 'none', poolMode: 'sum', target: 4, sorted: false })
  })

  it('parses chained sums into a selection', () => {
    expect(parseRollerNotation('2d6+1d8+3')).toEqual({
      selection: [{ sides: 6, count: 2 }, { sides: 8, count: 1 }], modifier: 3, advDis: 'none', poolMode: 'sum', target: 4, sorted: false,
    })
    expect(parseRollerNotation('2d20kh1+1d8')).toBeNull()
  })

  it('parses advantage and disadvantage', () => {
    expect(parseRollerNotation('2d20kh1')).toEqual({ selection: [{ sides: 20, count: 1 }], modifier: 0, advDis: 'adv', poolMode: 'sum', target: 4, sorted: false })
    expect(parseRollerNotation('2d20kl1+3')).toEqual({ selection: [{ sides: 20, count: 1 }], modifier: 3, advDis: 'dis', poolMode: 'sum', target: 4, sorted: false })
    // Keep count defaults to 1 on the server, like 2d20kh defaults to 2d20kh1.
    expect(parseRollerNotation('2d20kh')).toEqual({ selection: [{ sides: 20, count: 1 }], modifier: 0, advDis: 'adv', poolMode: 'sum', target: 4, sorted: false })
  })

  it('parses raw pool and success-count notations', () => {
    expect(parseRollerNotation('5d6p')).toEqual({ selection: [{ sides: 6, count: 5 }], modifier: 0, advDis: 'none', poolMode: 'pool', target: 4, sorted: false })
    expect(parseRollerNotation('5d6>=4')).toEqual({ selection: [{ sides: 6, count: 5 }], modifier: 0, advDis: 'none', poolMode: 'successes', target: 4, sorted: false })
    expect(parseRollerNotation('3d10>=8')).toEqual({ selection: [{ sides: 10, count: 3 }], modifier: 0, advDis: 'none', poolMode: 'successes', target: 8, sorted: false })
    // A raw-pool chip loads the default target for review, not a stale one.
    expect(parseRollerNotation('2d4p')).toEqual({ selection: [{ sides: 4, count: 2 }], modifier: 0, advDis: 'none', poolMode: 'pool', target: 4, sorted: false })
  })

  it('parses sorted pool and success-count notations', () => {
    expect(parseRollerNotation('5d6ps')).toEqual({ selection: [{ sides: 6, count: 5 }], modifier: 0, advDis: 'none', poolMode: 'pool', target: 4, sorted: true })
    expect(parseRollerNotation('5d6>=4s')).toEqual({ selection: [{ sides: 6, count: 5 }], modifier: 0, advDis: 'none', poolMode: 'successes', target: 4, sorted: true })
  })

  it('round-trips every canonical roller output', () => {
    const canonical = ['1d20', '2d20kh1', '2d20kl1', '3d6+2', '2d8-5', '1d100', '100d4+999', '2d6+1d8+3', '5d6p', '5d6>=4', '3d10>=8', '5d6ps', '5d6>=4s']
    for (const n of canonical) {
      const parsed = parseRollerNotation(n)
      expect(parsed).not.toBeNull()
      expect(buildNotation(parsed!.selection, parsed!.modifier, parsed!.advDis, parsed!.poolMode, parsed!.target, parsed!.sorted)).toBe(n)
    }
  })

  it('returns null for notations the form cannot represent', () => {
    // Drop highest/lowest has no form control.
    expect(parseRollerNotation('4d6dl1')).toBeNull()
    expect(parseRollerNotation('4d6dh1')).toBeNull()
    // Keep/drop counts other than 1, or on anything but 2d20 adv/dis.
    expect(parseRollerNotation('3d6kh2')).toBeNull()
    expect(parseRollerNotation('3d6kh1')).toBeNull()
    expect(parseRollerNotation('2d6kl1')).toBeNull()
    // Die sizes outside the picker options.
    expect(parseRollerNotation('1d30')).toBeNull()
    expect(parseRollerNotation('5d1000')).toBeNull()
    // Counts / modifiers outside the form bounds load nothing — the chip
    // keeps one-click roll instead of confirming different values.
    expect(parseRollerNotation('0d6')).toBeNull()
    expect(parseRollerNotation('101d6')).toBeNull()
    expect(parseRollerNotation('1d6+1000')).toBeNull()
    expect(parseRollerNotation('1d6-1000')).toBeNull()
    expect(parseRollerNotation('2d20kh1+1000')).toBeNull()
    // Not notations at all.
    expect(parseRollerNotation('')).toBeNull()
    expect(parseRollerNotation('hello')).toBeNull()
    // Subtracting dice is never a valid chain.
    expect(parseRollerNotation('2d6-1d8')).toBeNull()
    // The form has one badge per die size, so a repeated size can't round-trip.
    expect(parseRollerNotation('1d6+1d6')).toBeNull()
    // Keep/drop on a non-first group has no form control.
    expect(parseRollerNotation('2d6+2d20kh1')).toBeNull()
  })

  it('parses values at the edge of the form bounds', () => {
    expect(parseRollerNotation('100d6')).toEqual({ selection: [{ sides: 6, count: 100 }], modifier: 0, advDis: 'none', poolMode: 'sum', target: 4, sorted: false })
    expect(parseRollerNotation('1d20+999')).toEqual({ selection: [{ sides: 20, count: 1 }], modifier: 999, advDis: 'none', poolMode: 'sum', target: 4, sorted: false })
    expect(parseRollerNotation('1d20-999')).toEqual({ selection: [{ sides: 20, count: 1 }], modifier: -999, advDis: 'none', poolMode: 'sum', target: 4, sorted: false })
  })

  it('returns null for pool notations the form cannot represent', () => {
    // Unreachable targets and ambiguous combinations keep one-click roll.
    expect(parseRollerNotation('5d6>=7')).toBeNull()
    expect(parseRollerNotation('5d6p+2')).toBeNull()
    expect(parseRollerNotation('5d6kh1p')).toBeNull()
  })
})

describe('DiceRoller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    favoritesStub.favorites = []
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
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20')
  })

  it('rolls different dice together in one roll', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20, 2)
    pickDie(6, 1)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('2d20+1d6')
  })

  it('keeps every selected die in the bag', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    pickDie(6, 2)
    pickDie(8, 1)

    expect(screen.getByRole('button', { name: 'Add d6' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Add d8' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('dice-count-d6')).toHaveTextContent('2')
    expect(screen.getByTestId('dice-count-d8')).toHaveTextContent('1')
  })

  it('adds modifiers', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)

    // Sum mode has one spinbutton: the modifier (the target is pool-only).
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '5' } })

    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20+5')
  })

  it('adds negative modifiers', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '-2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20-2')
  })

  it('steps the modifier with +/- buttons for touch keyboards', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20+1')
  })

  it('applies advantage to a single d20', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Adv' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('2d20kh1')
  })

  it('applies disadvantage to a single d20', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Dis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('2d20kl1')
  })

  it('hides advantage once a second die or die type is added', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    expect(screen.getByRole('button', { name: 'Adv' })).toBeInTheDocument()

    pickDie(6)

    expect(screen.queryByRole('button', { name: 'Adv' })).not.toBeInTheDocument()
  })

  it('clears the whole dice selection and blocks rolling until a die is picked again', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Clear dice' }))

    // No die is selected and Roll is disabled with a hint.
    expect(screen.getByRole('button', { name: 'Add d20' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled()
    expect(screen.getByText('Pick at least one die to roll.')).toBeInTheDocument()

    // Picking dice makes the form ready to roll again.
    pickDie(6, 2)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('2d6')
  })

  it('clamps modifier to ±999 at the point of input', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20+999')
  })

  it('uses a numeric keyboard for the modifier input', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    expect(screen.getByLabelText('Modifier')).toHaveAttribute('inputmode', 'numeric')
  })

  it('hides advantage controls for non-d20', () => {
    render(<DiceRoller onRoll={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    expect(screen.getByRole('button', { name: 'Adv' })).toBeInTheDocument()

    pickDie(6)

    expect(screen.queryByRole('button', { name: 'Adv' })).not.toBeInTheDocument()
  })

  it('rolls a raw pool with no total', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Pool' }))
    pickDie(6, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('5d6p')
  })

  it('rolls a success-count pool with the target', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Successes' }))
    pickDie(6, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('5d6>=4')
  })

  it('rolls a sorted raw pool when the sort checkbox is checked', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Pool' }))
    pickDie(6, 5)
    fireEvent.click(screen.getByLabelText('Sort highest first'))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('5d6ps')
  })

  it('rolls a sorted success-count pool when the sort checkbox is checked', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Successes' }))
    pickDie(6, 5)
    fireEvent.click(screen.getByLabelText('Sort highest first'))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('5d6>=4s')
  })

  it('disables pool modes when more than one die type is selected', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    pickDie(6)
    pickDie(8)

    expect(screen.getByRole('button', { name: 'Pool' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Successes' })).toBeDisabled()
  })

  it('hides the sort checkbox in sum mode', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    expect(screen.queryByLabelText('Sort highest first')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pool' }))
    expect(screen.getByLabelText('Sort highest first')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sum' }))
    expect(screen.queryByLabelText('Sort highest first')).not.toBeInTheDocument()
  })

  it('hides the modifier and advantage controls in pool modes', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)

    fireEvent.click(screen.getByRole('button', { name: 'Pool' }))
    expect(screen.queryByRole('button', { name: 'Increase modifier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Adv' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Sum' }))
    expect(screen.getByRole('button', { name: 'Increase modifier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adv' })).toBeInTheDocument()
  })

  it('clamps the target to the die size at the point of input', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Successes' }))
    pickDie(6)

    fireEvent.change(screen.getByLabelText('Target'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d6>=6')
  })

  it('loads a success chip into the pool form instead of rolling at once', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: '1', notation: '5d6>=4', created_at: '2026-01-01T00:00:03Z' }],
      error: null
    } as any)

    const mockOnRoll = vi.fn()
    render(<DiceRoller channelId="c1" onRoll={mockOnRoll} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    await screen.findByRole('button', { name: 'Use 5d6>=4' })

    fireEvent.click(screen.getByRole('button', { name: 'Use 5d6>=4' }))
    expect(mockOnRoll).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Target')).toHaveValue(4)

    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('5d6>=4')
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

  it('shows no chips without a channel', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    expect(screen.queryByRole('button', { name: /^(Quick roll|Use) / })).not.toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('fetches and shows the last 3 notations as chips', async () => {
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
    await screen.findByRole('button', { name: 'Use 1d8' })

    // Duplicate notations collapse; newest distinct 3 win, regardless of row order ties.
    expect(screen.getByRole('button', { name: 'Use 2d6+1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use 1d20' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use 1d4' })).not.toBeInTheDocument()
  })

  it('loads the chip values into the form instead of rolling at once', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: '1', notation: '2d6+1', created_at: '2026-01-01T00:00:03Z' }],
      error: null
    } as any)

    const mockOnRoll = vi.fn()
    render(<DiceRoller channelId="c1" onRoll={mockOnRoll} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    await screen.findByRole('button', { name: 'Use 2d6+1' })

    // The tap fills the form but does not roll yet.
    fireEvent.click(screen.getByRole('button', { name: 'Use 2d6+1' }))
    expect(mockOnRoll).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add d6' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('dice-count-d6')).toHaveTextContent('2')
    expect(screen.getByLabelText('Modifier')).toHaveValue(1)

    // Confirming with Roll sends the same notation.
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('2d6+1')
  })

  it('loads advantage chips into the d20 toggle', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: '1', notation: '2d20kh1', created_at: '2026-01-01T00:00:03Z' }],
      error: null
    } as any)

    const mockOnRoll = vi.fn()
    render(<DiceRoller channelId="c1" onRoll={mockOnRoll} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    await screen.findByRole('button', { name: 'Use 2d20kh1' })

    fireEvent.click(screen.getByRole('button', { name: 'Use 2d20kh1' }))
    expect(mockOnRoll).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('2d20kh1')
  })

  it('keeps one-click roll for notations the form cannot represent', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: '1', notation: '4d6dl1', created_at: '2026-01-01T00:00:03Z' }],
      error: null
    } as any)

    const mockOnRoll = vi.fn()
    render(<DiceRoller channelId="c1" onRoll={mockOnRoll} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    await screen.findByRole('button', { name: 'Quick roll 4d6dl1' })

    fireEvent.click(screen.getByRole('button', { name: 'Quick roll 4d6dl1' }))
    expect(mockOnRoll).toHaveBeenCalledWith('4d6dl1')
  })

  it('prepends the notation just rolled to the chips', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller channelId="c1" onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20')

    // Reopen: the roll just made is now a chip; tapping it loads the form.
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Use 1d20' }))
    expect(mockOnRoll).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20')
  })

  it('closes on Roll when rendered as a BottomSheet', () => {
    render(<DiceRoller popup channelId="c1" onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(screen.queryByRole('dialog', { name: 'Dice Roller' })).not.toBeInTheDocument()
  })

  it('keeps the notation rolled while history fetch is in flight', async () => {
    let resolveHistory: (value: unknown) => void = () => {}
    vi.mocked(supabase.rpc).mockImplementation(
      (() => new Promise(resolve => { resolveHistory = resolve })) as any
    )

    const mockOnRoll = vi.fn()
    render(<DiceRoller channelId="c1" onRoll={mockOnRoll} />)

    // Roll while the history response is still pending.
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(mockOnRoll).toHaveBeenCalledWith('1d20')

    // Reopen — local chip present, history still loading.
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    expect(screen.getByRole('button', { name: 'Use 1d20' })).toBeInTheDocument()

    // Now the stale snapshot arrives; it must not evict the local roll.
    resolveHistory({
      data: [
        { id: '1', notation: '2d6+1', created_at: '2026-01-01T00:00:03Z' },
        { id: '2', notation: '1d8', created_at: '2026-01-01T00:00:02Z' },
        { id: '3', notation: '1d4', created_at: '2026-01-01T00:00:01Z' }
      ]
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Use 2d6+1' })).toBeInTheDocument()
    })
    // Local notation (rolled after the snapshot) still first.
    expect(screen.getByRole('button', { name: 'Use 1d20' })).toBeInTheDocument()
    // Oldest slot filled by history, not evicted entirely.
    expect(screen.getByRole('button', { name: 'Use 1d8' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use 1d4' })).not.toBeInTheDocument()
  })

  it('pins favorites first with distinct styling', async () => {
    favoritesStub.favorites = ['1d8']
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { id: '1', notation: '2d6+1', created_at: '2026-01-01T00:00:03Z' },
        { id: '2', notation: '1d8', created_at: '2026-01-01T00:00:02Z' }
      ],
      error: null
    } as any)

    render(<DiceRoller channelId="c1" onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    await screen.findByRole('button', { name: 'Use 1d8' })

    // The favorited notation appears once, first, in amber.
    const buttons = screen.getAllByRole('button', { name: /^Use / })
    expect(buttons.map(b => b.textContent)).toEqual(['1d8', '2d6+1'])
    expect(screen.getByRole('button', { name: 'Use 1d8' }).closest('span')?.className).toContain('amber')
    expect(screen.getByRole('button', { name: 'Use 2d6+1' }).closest('span')?.className).toContain('indigo')

    const unfavorite = screen.getByRole('checkbox', { name: 'Unfavorite 1d8' })
    expect(unfavorite).toBeChecked()
    expect(unfavorite).toBeEnabled()
    fireEvent.click(unfavorite)
    expect(favoritesStub.toggleFavorite).toHaveBeenCalledWith('1d8')
  })

  it('shows a favorite even when it is absent from recent history', async () => {
    favoritesStub.favorites = ['3d8']
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)

    render(<DiceRoller channelId="c1" onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    expect(await screen.findByRole('button', { name: 'Use 3d8' })).toBeInTheDocument()
  })

  it('fills the row with favorites so nothing new can be pinned while three exist', async () => {
    favoritesStub.favorites = ['1d20', '1d8', '1d4']
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: '1', notation: '2d6+1', created_at: '2026-01-01T00:00:03Z' }],
      error: null
    } as any)

    render(<DiceRoller channelId="c1" onRoll={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    await screen.findByRole('checkbox', { name: 'Unfavorite 1d20' })

    // All three slots are pinned; the new roll has no slot and therefore no
    // (disabled) pin checkbox — pinned chips stay enabled to be unpinned.
    expect(screen.queryByRole('button', { name: 'Use 2d6+1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Favorite 2d6+1' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Unfavorite 1d20' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Unfavorite 1d8' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Unfavorite 1d4' })).toBeEnabled()
  })

  it('renders a floating trigger and opens the roll history from the panel', () => {
    const onOpenHistory = vi.fn()
    render(<DiceRoller fab onOpenHistory={onOpenHistory} onRoll={vi.fn()} />)

    // The labelled composer chip is replaced by the round floating trigger.
    expect(screen.queryByRole('button', { name: /Roll Dice/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open dice roller' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll History' }))

    expect(onOpenHistory).toHaveBeenCalledTimes(1)
    // The roller closes itself before history opens, so dismissing history
    // returns to the channel rather than the still-open roller.
    expect(screen.queryByRole('button', { name: 'Open dice roller' })).toBeInTheDocument()
    expect(screen.queryByText('Dice Roller')).not.toBeInTheDocument()
  })
})
