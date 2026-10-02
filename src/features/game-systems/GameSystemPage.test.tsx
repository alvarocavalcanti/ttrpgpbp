import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GameSystemPage } from './GameSystemPage'
import { useAuth } from '../auth/useAuth'

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/game-systems/:slug" element={<GameSystemPage />} />
        <Route path="/features" element={<div data-testid="features" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('GameSystemPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never)
  })

  it('renders the Shadowdark page with its attributes and a dice-roller link', () => {
    renderAt('/game-systems/shadowdark')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Play Shadowdark by Post' }),
    ).toBeInTheDocument()
    expect(screen.getByText('STR')).toBeInTheDocument()
    expect(screen.getByText('CHA')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'public dice roller' })).toHaveAttribute(
      'href',
      '/dice-roller',
    )
  })

  it('redirects an unknown system to the features page', () => {
    renderAt('/game-systems/not-a-system')
    expect(screen.getByTestId('features')).toBeInTheDocument()
  })
})
