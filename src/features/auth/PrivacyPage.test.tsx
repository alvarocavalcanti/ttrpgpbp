import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

const mockEnv = vi.hoisted(() => ({ VITE_GA_MEASUREMENT_ID: '', VITE_SENTRY_DSN: '' }))

vi.mock('../../env', () => ({ env: mockEnv }))

beforeEach(() => {
  mockEnv.VITE_GA_MEASUREMENT_ID = ''
  mockEnv.VITE_SENTRY_DSN = ''
})

function BackProbe() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)} data-testid="back-probe">
      back
    </button>
  )
}

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

  it('does not claim data is shared only with Supabase', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.queryByText(/shared only with our infrastructure provider/)).not.toBeInTheDocument()
  })

  it('discloses Google Analytics only when configured', () => {
    mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST123'
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Google Analytics')).toBeInTheDocument()
    expect(screen.queryByText('Sentry')).not.toBeInTheDocument()
    expect(screen.getByText(/never your search terms, messages, or dice rolls/)).toBeInTheDocument()
  })

  it('discloses Sentry only when configured', () => {
    mockEnv.VITE_SENTRY_DSN = 'https://test@ingest.sentry.io/1'
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Sentry')).toBeInTheDocument()
    expect(screen.queryByText('Google Analytics')).not.toBeInTheDocument()
    expect(screen.getByText(/screen recording of about 1 in 10 sessions/)).toBeInTheDocument()
  })

  it('replaces the entry when returning to lobby so back does not re-enter the page', () => {
    render(
      <MemoryRouter initialEntries={['/privacy']}>
        <Routes>
          <Route path="/privacy" element={<PrivacyPage />} />
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
