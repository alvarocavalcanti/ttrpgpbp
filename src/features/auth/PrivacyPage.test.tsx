import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { PrivacyPage } from './PrivacyPage'

const mockEnv = vi.hoisted(() => ({ VITE_GA_MEASUREMENT_ID: '', VITE_SENTRY_DSN: '', VITE_CONTROLLER_NAME: '', VITE_CONTROLLER_EMAIL: '' }))

vi.mock('../../env', () => ({ env: mockEnv }))

beforeEach(() => {
  mockEnv.VITE_GA_MEASUREMENT_ID = ''
  mockEnv.VITE_SENTRY_DSN = ''
  mockEnv.VITE_CONTROLLER_NAME = ''
  mockEnv.VITE_CONTROLLER_EMAIL = ''
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
    expect(screen.getAllByText('Email updates').length).toBeGreaterThan(0)
    expect(screen.getByText('email')).toBeInTheDocument()
    expect(screen.getByText('profile')).toBeInTheDocument()
  })

  it('describes the email opt-in consent basis and purposes', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/If you opt in to email updates in Settings/)).toBeInTheDocument()
    expect(screen.getAllByText(/product updates, beta invitations, and replies to feedback or/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Your email is never shared or sold/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Account\s*and security notices may be sent without consent/)).toBeInTheDocument()
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

  it('discloses the lack of end-to-end encryption and who can access messages', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText('How your messages are stored & who can access them')).toBeInTheDocument()
    expect(screen.getByText(/not end-to-end encrypted/)).toBeInTheDocument()
    expect(screen.getByText(/in a form our system administrators\s*can read/)).toBeInTheDocument()
  })

  it('documents EEA-to-US data transfers and GDPR-specific rights', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Data transfers outside Europe')).toBeInTheDocument()
    expect(screen.getByText(/Standard Contractual Clauses/)).toBeInTheDocument()
    expect(screen.getByText('Your GDPR rights')).toBeInTheDocument()
    expect(screen.getByText(/Data Protection Commission/)).toBeInTheDocument()
  })

  it('states the lawful bases for processing', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Lawful bases')).toBeInTheDocument()
    expect(screen.getByText(/performance of our contract with you/)).toBeInTheDocument()
    expect(screen.getByText(/legitimate interests \(safety, security/)).toBeInTheDocument()
  })

  it('discloses the age-confirmation record in what we collect', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/we record the date of that confirmation/)).toBeInTheDocument()
  })

  it('discloses the recorded terms acceptance in what we collect', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText(/we record the date and\s*the version of your acceptance/)).toBeInTheDocument()
  })

  it('names the data controller from env', () => {
    mockEnv.VITE_CONTROLLER_NAME = 'Alvaro Cavalcanti'
    mockEnv.VITE_CONTROLLER_EMAIL = 'alvarovictor@gmail.com'
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText('Data controller')).toBeInTheDocument()
    expect(screen.getAllByText(/Alvaro Cavalcanti/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'alvarovictor@gmail.com' })).toHaveLength(2)
    screen.getAllByRole('link', { name: 'alvarovictor@gmail.com' }).forEach((link) => {
      expect(link).toHaveAttribute('href', 'mailto:alvarovictor@gmail.com')
    })
  })

  it('renders a generic controller line without contact when env is unset', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getAllByText(/the operator of this Role by Post instance/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
  })

  it('discloses image retention and the lack of automated scanning', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    )

    expect(screen.getByText('How long we keep things')).toBeInTheDocument()
    expect(screen.getByText(/indefinitely by default/)).toBeInTheDocument()
    expect(screen.getByText(/not automatically scanned/)).toBeInTheDocument()
    expect(screen.getByText(/as long as\s*needed for moderation and legal reporting/)).toBeInTheDocument()
  })
})
