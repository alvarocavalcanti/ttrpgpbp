import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { DiceRollerPage } from './DiceRollerPage'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

function renderPage() {
  return render(
    <MemoryRouter>
      <DiceRollerPage />
    </MemoryRouter>,
  )
}

function pickDie(sides: number, count = 1) {
  for (let i = 0; i < count; i++) {
    fireEvent.click(screen.getByRole('button', { name: `Add d${sides}` }))
  }
}

describe('DiceRollerPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never)
  })

  it('renders a single h1 and no result before interacting', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Dice Roller' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Dice results')).not.toBeInTheDocument()
    // Nothing picked yet, so Roll is disabled.
    expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled()
  })

  it('rolls client-side and shows the notation and total', () => {
    renderPage()
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('1d20')).toBeInTheDocument()
    expect(screen.getByText(/^Total \d+$/)).toBeInTheDocument()
  })

  it('combines different dice in one roll', () => {
    renderPage()
    pickDie(6, 2)
    pickDie(8)
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('2d6+1d8+1')).toBeInTheDocument()
  })

  it('uses the successes mode to count face results', () => {
    renderPage()
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Successes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('1d20>=4')).toBeInTheDocument()
    expect(screen.getByText(/^\d+ success(es)?$/)).toBeInTheDocument()
  })

  it('rolls a sorted pool with the chosen number of dice', () => {
    renderPage()
    pickDie(20, 4)
    fireEvent.click(screen.getByRole('button', { name: 'Pool' }))
    fireEvent.click(screen.getByLabelText('Sort highest first'))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('4d20ps')).toBeInTheDocument()
    expect(screen.getByText('4 dice')).toBeInTheDocument()
  })

  it('disables pool modes while several die types are selected', () => {
    renderPage()
    pickDie(6)
    pickDie(8)
    expect(screen.getByRole('button', { name: 'Pool' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Successes' })).toBeDisabled()
  })

  it('applies advantage to a single d20 sum roll', () => {
    renderPage()
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Advantage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('2d20kh1')).toBeInTheDocument()
  })

  it('adds the modifier to the notation', () => {
    renderPage()
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Increase modifier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('1d20+1')).toBeInTheDocument()
  })

  it('keeps Clear visible but disabled until a die is picked, then clears the selection (#697)', () => {
    renderPage()

    const clear = screen.getByRole('button', { name: 'Clear dice' })
    expect(clear).toBeDisabled()

    pickDie(20)
    expect(clear).toBeEnabled()
    fireEvent.click(clear)

    expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled()
  })

  it('resets advantage when the selection is cleared (#697)', () => {
    renderPage()
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Advantage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear dice' }))

    // Re-pick a d20: clearing reset Advantage, so this rolls a plain d20.
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('1d20')).toBeInTheDocument()
  })

  it('marks the active mode for assistive tech', () => {
    renderPage()
    const pool = screen.getByRole('button', { name: 'Pool' })
    expect(pool).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(pool)
    expect(pool).toHaveAttribute('aria-pressed', 'true')
  })

  it('never calls Supabase — the public roller is browser-only', () => {
    const rpc = vi.spyOn(supabase, 'rpc')
    renderPage()
    pickDie(20)
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockRestore()
  })
})
