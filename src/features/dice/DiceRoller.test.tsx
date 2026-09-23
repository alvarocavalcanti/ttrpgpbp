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

describe('parseRollerNotation', () => {
  it('parses plain notations', () => {
    expect(parseRollerNotation('1d20')).toEqual({ diceType: 'd20', quantity: 1, modifier: 0, advDis: 'none' })
    expect(parseRollerNotation('3d6+2')).toEqual({ diceType: 'd6', quantity: 3, modifier: 2, advDis: 'none' })
    expect(parseRollerNotation('2d8-5')).toEqual({ diceType: 'd8', quantity: 2, modifier: -5, advDis: 'none' })
  })

  it('parses advantage and disadvantage', () => {
    expect(parseRollerNotation('2d20kh1')).toEqual({ diceType: 'd20', quantity: 1, modifier: 0, advDis: 'adv' })
    expect(parseRollerNotation('2d20kl1+3')).toEqual({ diceType: 'd20', quantity: 1, modifier: 3, advDis: 'dis' })
    // Keep count defaults to 1 on the server, like 2d20kh defaults to 2d20kh1.
    expect(parseRollerNotation('2d20kh')).toEqual({ diceType: 'd20', quantity: 1, modifier: 0, advDis: 'adv' })
  })

  it('round-trips every canonical roller output', () => {
    const canonical = ['1d20', '2d20kh1', '2d20kl1', '3d6+2', '2d8-5', '1d100', '100d4+999']
    for (const n of canonical) {
      const parsed = parseRollerNotation(n)
      expect(parsed).not.toBeNull()
      expect(buildNotation(parsed!.diceType, parsed!.quantity, parsed!.modifier, parsed!.advDis)).toBe(n)
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
    // Die sizes outside the select options.
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
  })

  it('parses values at the edge of the form bounds', () => {
    expect(parseRollerNotation('100d6')).toEqual({ diceType: 'd6', quantity: 100, modifier: 0, advDis: 'none' })
    expect(parseRollerNotation('1d20+999')).toEqual({ diceType: 'd20', quantity: 1, modifier: 999, advDis: 'none' })
    expect(parseRollerNotation('1d20-999')).toEqual({ diceType: 'd20', quantity: 1, modifier: -999, advDis: 'none' })
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
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('d6')
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()

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
})