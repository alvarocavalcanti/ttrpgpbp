import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

describe('PrivacyPage', () => {
  it('renders policy sections and OAuth scope details', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText('What we collect')).toBeInTheDocument()
    expect(screen.getByText('Where data is stored')).toBeInTheDocument()
    expect(screen.getByText('Google OAuth scopes')).toBeInTheDocument()
    expect(screen.getByText('email')).toBeInTheDocument()
    expect(screen.getByText('profile')).toBeInTheDocument()
  })

  it('links back home', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
  })

  it('explains access and erasure rights', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/Download My Data/)).toBeInTheDocument()
    expect(screen.getByText(/Delete Account/)).toBeInTheDocument()
  })

  it('contains the Google API Limited Use disclosure', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/Google API Services User Data Policy/)).toBeInTheDocument()
    expect(screen.getByText(/Limited Use Disclosure/)).toBeInTheDocument()
  })
})
