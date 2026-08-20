import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { TermsPage } from './TermsPage'

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
    expect(screen.getByText('7. Disclaimer of Warranties')).toBeInTheDocument()
  })

  it('links back home', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
  })
})
