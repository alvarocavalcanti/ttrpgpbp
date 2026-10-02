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

describe('DiceRollerPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never)
  })

  it('renders a single h1 and no result before interacting', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Dice Roller' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Dice results')).not.toBeInTheDocument()
  })

  it('rolls client-side and shows the notation and total', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('1d20')).toBeInTheDocument()
    expect(screen.getByText(/^Total \d+$/)).toBeInTheDocument()
  })

  it('uses the successes mode to count face results', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Successes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(screen.getByText('1d20>=4')).toBeInTheDocument()
    expect(screen.getByText(/^\d+ success(es)?$/)).toBeInTheDocument()
  })

  it('never calls Supabase — the public roller is browser-only', () => {
    const rpc = vi.spyOn(supabase, 'rpc')
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockRestore()
  })
})
