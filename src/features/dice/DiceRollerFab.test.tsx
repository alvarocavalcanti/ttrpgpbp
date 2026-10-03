import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DiceRollerFab, clampFabPosition, defaultFabPosition } from './DiceRollerFab'

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }
}))

vi.mock('./useDiceFavorites', () => ({
  useDiceFavorites: () => ({
    favorites: [], isFavorite: () => false, canFavorite: true, toggleFavorite: vi.fn()
  })
}))

describe('dice roller fab position', () => {
  it('defaults to the bottom-right with a margin', () => {
    expect(defaultFabPosition(400, 300, 56, 56, 12)).toEqual({ x: 332, y: 232 })
  })

  it('clamps a dragged position inside the area', () => {
    expect(clampFabPosition(-50, -50, 400, 300, 56, 56, 12)).toEqual({ x: 12, y: 12 })
    expect(clampFabPosition(999, 999, 400, 300, 56, 56, 12)).toEqual({ x: 332, y: 232 })
  })

  it('keeps the margin when the area is smaller than the fab', () => {
    expect(clampFabPosition(50, 50, 40, 40, 56, 56, 12)).toEqual({ x: 12, y: 12 })
  })
})

describe('DiceRollerFab', () => {
  it('renders the floating trigger and opens the roller', () => {
    render(<DiceRollerFab channelId="c1" onRoll={vi.fn()} onOpenHistory={vi.fn()} />)
    expect(screen.queryByText('Dice Roller')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open dice roller' }))

    expect(screen.getByText('Dice Roller')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll' })).toBeInTheDocument()
  })
})
