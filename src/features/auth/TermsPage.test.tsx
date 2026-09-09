import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { TermsPage } from './TermsPage'

function BackProbe() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)} data-testid="back-probe">
      back
    </button>
  )
}

describe('TermsPage', () => {
  it('renders terms sections and headers', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByText('1. Acceptance of Terms')).toBeInTheDocument()
    expect(screen.getByText('2. Description of Service')).toBeInTheDocument()
    expect(screen.getByText('3. User Accounts')).toBeInTheDocument()
    expect(screen.getByText('4. User Content')).toBeInTheDocument()
    expect(screen.getByText('6. Communications')).toBeInTheDocument()
    expect(screen.getByText('7. Termination')).toBeInTheDocument()
    expect(screen.getByText('9. Limitation of Liability')).toBeInTheDocument()
  })

  it('covers in-app messaging and email opt-in consent in the Communications section', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/In-app messages/)).toBeInTheDocument()
    expect(screen.getByText(/only send you email if you opt in/)).toBeInTheDocument()
    expect(screen.getByText(/opt out at any time/)).toBeInTheDocument()
    expect(screen.getByText(/Account and security notices/)).toBeInTheDocument()
  })

  it('links back home', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
  })

  it('replaces the entry when returning to lobby so back does not re-enter the page', () => {
    render(
      <MemoryRouter initialEntries={['/terms']}>
        <Routes>
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/" element={<BackProbe />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('back-probe'))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()
  })
})
