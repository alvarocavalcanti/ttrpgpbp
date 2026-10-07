import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { PressPage } from './PressPage'
import { useAuth } from '../auth/useAuth'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockEnv = vi.hoisted(() => ({ VITE_CONTROLLER_EMAIL: '' }))
vi.mock('../../env', () => ({ env: mockEnv }))

function mockAuth(user: unknown, loading = false) {
  vi.mocked(useAuth).mockReturnValue({
    loading,
    user: user as never,
    profile: null,
    session: null,
    error: null,
    signInWithGoogle: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
    termsConfirmState: 'idle',
    retryTermsConfirm: vi.fn(),
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PressPage />
    </MemoryRouter>
  )
}

describe('PressPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth(null)
    mockEnv.VITE_CONTROLLER_EMAIL = 'press@rolebypost.com'
  })

  it('renders a single H1 with the one-liner and the not-a-VTT copy', () => {
    renderPage()

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Press kit')
    expect(
      screen.getByText('Role by Post is a chat-first app for asynchronous tabletop RPGs.')
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /not a VTT/ })).toBeInTheDocument()
  })

  it('states the free, no-paid-tier fact with the campaign limit', () => {
    renderPage()

    // Literal per DAMP: breaks if the source constant changes.
    expect(screen.getByText(/no paid tier/)).toBeInTheDocument()
    expect(screen.getByText(/default 10 active campaigns/)).toBeInTheDocument()
  })

  it('shows the press contact as a mailto link from the controller email', () => {
    renderPage()

    const contact = screen.getByRole('link', { name: 'press@rolebypost.com' })
    expect(contact).toHaveAttribute('href', 'mailto:press@rolebypost.com')
  })

  it('links the GitHub repo, Features, and the public changelog', () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute(
      'href',
      'https://github.com/alvarocavalcanti/ttrpgpbp'
    )
    // "Features" appears in both the press Links list and the shared footer.
    const featureLinks = screen.getAllByRole('link', { name: 'Features' })
    expect(featureLinks.some((link) => link.getAttribute('href') === '/features')).toBe(true)
    expect(screen.getByRole('link', { name: 'Changelog' })).toHaveAttribute(
      'href',
      '/help/changelog'
    )
  })

  it('renders the five screenshots from committed full-size captures', () => {
    renderPage()

    const sources = screen.getAllByRole('img').map((img) => img.getAttribute('src'))
    expect(sources).toEqual([
      '/help-images/lobby-with-channels.png',
      '/help-images/message-actions.png',
      '/help-images/ability-check.png',
      '/help-images/safety-tools.png',
      '/help-images/status-bar.png',
    ])
    for (const source of sources) {
      expect(existsSync(resolve(process.cwd(), 'public', (source as string).slice(1)))).toBe(true)
    }
  })

  it('renders downloadable brand assets', () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'Role by Post logo (PNG)' })).toHaveAttribute(
      'href',
      '/RoleByPost.png'
    )
    expect(screen.getByRole('link', { name: /Social share card/ })).toHaveAttribute(
      'href',
      '/og-image.png'
    )
  })

  it('shows the sign-in header to anonymous visitors while auth is loading', () => {
    mockAuth(null, true)
    renderPage()

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('hides the sign-in header for signed-in visitors', () => {
    mockAuth({ id: 'user-1' })
    renderPage()

    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('Press kit')
  })
})
