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
    expect(screen.getByText('5. Acceptable Use & Prohibited Conduct')).toBeInTheDocument()
    expect(screen.getByText('6. Data Security, Monitoring & Encryption Disclosure')).toBeInTheDocument()
    expect(screen.getByText('7. Safety Reporting & Law Enforcement Cooperation')).toBeInTheDocument()
    expect(screen.getByText('8. User Content & Indemnification')).toBeInTheDocument()
    expect(screen.getByText('9. Communications')).toBeInTheDocument()
    expect(screen.getByText('10. Termination')).toBeInTheDocument()
    expect(screen.getByText('11. Disclaimer of Warranties')).toBeInTheDocument()
    expect(screen.getByText('12. Limitation of Liability')).toBeInTheDocument()
    expect(screen.getByText('13. Eligibility')).toBeInTheDocument()
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

  it('discloses that messages are not end-to-end encrypted and may be reviewed', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/not end-to-end encrypted/)).toBeInTheDocument()
    expect(screen.getByText(/system administrators and automated safety systems can access/)).toBeInTheDocument()
  })

  it('bans illegal content, conspiracy, and illicit imagery in the Acceptable Use policy', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/child sexual abuse material \(CSAM\)/)).toBeInTheDocument()
    expect(screen.getByText(/conspiracy or coordination to commit any crime/)).toBeInTheDocument()
    expect(screen.getByText(/non-consensual intimate imagery/)).toBeInTheDocument()
  })

  it('describes safety reporting and law enforcement cooperation', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/Hotline\.ie/)).toBeInTheDocument()
    expect(screen.getByText(/valid legal process/)).toBeInTheDocument()
  })

  it('includes a user content indemnity, a UGC liability carve-out, and the age requirement', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/indemnify, defend, and hold harmless/)).toBeInTheDocument()
    expect(screen.getByText(/This limitation applies\s*to user-to-user misconduct/)).toBeInTheDocument()
    expect(screen.getByText(/at least 16 years of age/)).toBeInTheDocument()
  })
})
