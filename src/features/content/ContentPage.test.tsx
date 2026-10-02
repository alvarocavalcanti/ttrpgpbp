import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ContentPage } from './ContentPage'
import { useAuth } from '../auth/useAuth'

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

function mockAuth(user: unknown) {
  vi.mocked(useAuth).mockReturnValue({ user: user as never } as never)
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/play-by-post" element={<ContentPage />} />
        <Route path="/how-to/run-play-by-post" element={<ContentPage />} />
        <Route path="/not-content" element={<ContentPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ContentPage', () => {
  it('renders the h1, breadcrumbs, and markdown body for a content route', () => {
    mockAuth(null)
    renderAt('/play-by-post')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Play-by-Post Tabletop RPGs' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0)
    expect(screen.getByText(/tabletop roleplaying played in writing/i)).toBeInTheDocument()
  })

  it('credits the author with a link to the About page (#645)', () => {
    mockAuth(null)
    renderAt('/play-by-post')
    const links = screen.getAllByRole('link', { name: 'Alvaro Cavalcanti' })
    expect(links.some((link) => link.getAttribute('href') === 'https://memorablenaton.es')).toBe(true)
  })

  it('sets the SEO title from the route registry', () => {
    mockAuth(null)
    renderAt('/play-by-post')
    expect(document.title).toBe('Play-by-Post Tabletop RPGs — Role by Post')
  })

  it('renders a different document per route', () => {
    mockAuth(null)
    renderAt('/how-to/run-play-by-post')
    expect(
      screen.getByRole('heading', { level: 1, name: 'How to Run a Play-by-Post Game' }),
    ).toBeInTheDocument()
  })

  it('resolves a route with a trailing slash instead of rendering blank', () => {
    mockAuth(null)
    renderAt('/play-by-post/')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Play-by-Post Tabletop RPGs' }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Play-by-Post Tabletop RPGs — Role by Post')
  })

  it('renders nothing for an unregistered path', () => {
    mockAuth(null)
    const { container } = renderAt('/not-content')
    expect(container).toBeEmptyDOMElement()
  })

  it('hides the slim header for signed-in visitors', () => {
    mockAuth({ id: 'user-1' })
    renderAt('/play-by-post')
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })
})
