import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter, Link } from 'react-router-dom'
import { ChangelogProvider, useChangelog } from './useChangelog'
import { useAuth } from '../auth/useAuth'
import { getChangelogHash } from './changelog'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

const hash = getChangelogHash()

function Trigger() {
  const { openChangelog } = useChangelog()
  return <button type="button" onClick={openChangelog}>open changelog</button>
}

function renderProvider(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ChangelogProvider>
        <Trigger />
        <Link to="/">home</Link>
      </ChangelogProvider>
    </MemoryRouter>
  )
}

describe('ChangelogProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('auto-shows the modal when there is no seen marker', async () => {
    renderProvider()
    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeInTheDocument()
  })

  it('auto-shows the modal when the seen marker is stale', async () => {
    localStorage.setItem('changelog:seen', 'stale-hash')
    renderProvider()
    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeInTheDocument()
  })

  it('does not auto-show when the seen marker matches the current changelog', () => {
    localStorage.setItem('changelog:seen', hash)
    renderProvider()
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
  })

  it('does not auto-show when dismissed forever', () => {
    localStorage.setItem('changelog:forever', 'true')
    renderProvider()
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
  })

  it('does not auto-show when logged out', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    renderProvider()
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
  })

  it('does not auto-show on the marketing page even when signed in (#536)', () => {
    renderProvider(['/features'])
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
  })

  it('does not auto-show on the marketing page with a trailing slash (#536)', () => {
    renderProvider(['/features/'])
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
  })

  it('auto-shows after navigating from the marketing page into the app (#536)', async () => {
    renderProvider(['/features'])
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'home' }))
    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeInTheDocument()
  })

  it('dismiss writes the seen marker and closes the modal', async () => {
    renderProvider()
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(localStorage.getItem('changelog:seen')).toBe(hash)
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
  })

  it('dismiss forever writes the sentinel and closes the modal', async () => {
    renderProvider()
    fireEvent.click(await screen.findByRole('button', { name: "Don't show again" }))
    expect(localStorage.getItem('changelog:forever')).toBe('true')
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
  })

  it('openChangelog opens the modal even when dismissed forever', async () => {
    localStorage.setItem('changelog:forever', 'true')
    renderProvider()
    expect(screen.queryByRole('dialog', { name: "What's new" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'open changelog' }))
    expect(await screen.findByRole('dialog', { name: "What's new" })).toBeInTheDocument()
  })

  it('useChangelog throws outside a provider', () => {
    expect(() => render(<Trigger />)).toThrow('useChangelog must be used within a ChangelogProvider')
  })
})
