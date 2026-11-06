import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelpPage } from './HelpPage'
import { getChannelHelp, getGeneralHelp } from './helpContent'
import { useAuth } from '../auth/useAuth'

vi.mock('./helpContent', () => ({
  getGeneralHelp: vi.fn(),
  getChannelHelp: vi.fn(),
}))

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }))

const general = [
  { slug: 'dice-rolling', title: 'Dice Rolling', content: '## Inline notation\n\nClick dice.', screenshot: '/help-images/dice-panel.png' },
  { slug: 'search', title: 'Search', content: '## How to search\n\nType text.' },
]
const channel = [
  { slug: 'gm-tools', title: 'GM Tools', content: '## GM controls\n\nRun the table.' },
]

describe('HelpPage', () => {
  beforeEach(() => {
    vi.mocked(getGeneralHelp).mockReturnValue(general as any)
    vi.mocked(getChannelHelp).mockReturnValue(channel as any)
    vi.mocked(useAuth).mockReturnValue({ user: null } as never)
  })

  const renderPage = (initialEntries = ['/help']) =>
    render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/help" element={<HelpPage />} />
          <Route path="/help/:topic" element={<HelpPage />} />
        </Routes>
      </MemoryRouter>
    )

  it('renders the grouped topic list and first topic content by default', () => {
    renderPage()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Channel')).toBeInTheDocument()
    expect(screen.getAllByText('Dice Rolling').length).toBeGreaterThan(0)
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('GM Tools')).toBeInTheDocument()
    expect(screen.getByText('Inline notation')).toBeInTheDocument()
  })

  it('renders screenshot when entry has one', () => {
    renderPage()
    const img = screen.getByAltText('Dice Rolling screenshot')
    expect(img).toHaveAttribute('src', '/help-images/dice-panel.png')
  })

  it('shows selected topic content when navigating by slug, including channel guides', () => {
    renderPage(['/help/search'])
    expect(screen.getByText('How to search')).toBeInTheDocument()
    expect(screen.queryByText('Inline notation')).not.toBeInTheDocument()

    renderPage(['/help/gm-tools'])
    expect(screen.getByText('GM controls')).toBeInTheDocument()
  })

  it('switches content when a topic is clicked', () => {
    renderPage()
    fireEvent.click(screen.getByText('Search'))
    expect(screen.getByText('How to search')).toBeInTheDocument()
  })

  it('redirects to /help for an unknown topic', () => {
    renderPage(['/help/nope'])
    expect(screen.getAllByText('Dice Rolling').length).toBeGreaterThan(0)
    expect(screen.getByText('Inline notation')).toBeInTheDocument()
  })

  it('shows empty state when no topics exist', () => {
    vi.mocked(getGeneralHelp).mockReturnValue([])
    vi.mocked(getChannelHelp).mockReturnValue([])
    renderPage()
    expect(screen.getByText(/No help topics available yet/)).toBeInTheDocument()
  })

  it('applies dark-mode classes to content and inactive topic links', () => {
    const { container } = renderPage()
    expect(container.querySelector('.prose')).toHaveClass('dark:prose-invert')
    const inactive = screen.getByText('Search')
    expect(inactive).toHaveClass('dark:text-gray-300')
    expect(inactive).toHaveClass('dark:hover:bg-gray-700')
  })

  it('credits the author with a link to the About page (#645)', () => {
    renderPage(['/help/dice-rolling'])
    const links = screen.getAllByRole('link', { name: 'Alvaro Cavalcanti' })
    expect(links.some((link) => link.getAttribute('href') === 'https://memorablenaton.es')).toBe(true)
  })

  it('sets a canonical URL for the active help topic', () => {
    renderPage(['/help/dice-rolling'])
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://rolebypost.com/help/dice-rolling'
    )
  })

  it('normalizes a trailing slash for the canonical URL', () => {
    renderPage(['/help/dice-rolling/'])
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://rolebypost.com/help/dice-rolling'
    )
  })

  it('gives signed-out visitors a public header and footer to navigate home', () => {
    renderPage(['/help/dice-rolling'])
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Play-by-Post' })[0]).toHaveAttribute(
      'href',
      '/play-by-post'
    )
  })

  it('hides the marketing header and footer for signed-in visitors', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as never)
    renderPage(['/help/dice-rolling'])
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Footer' })).not.toBeInTheDocument()
  })

  it('bounds its panes so the article scrolls internally (#706)', () => {
    const { container } = renderPage(['/help/dice-rolling'])

    // DAMP literals: inside the pinned AppShell the root fills the bounded
    // <main> and lets its panes shrink (min-h-0) so the sidebar stays put and
    // the article — not the document — scrolls. See AppShell + #706.
    const root = container.firstElementChild!
    expect(root).toHaveClass('flex-1')
    expect(root).toHaveClass('min-h-0')

    const article = screen.getByRole('main')
    expect(article).toHaveClass('min-h-0')
    expect(article).toHaveClass('overflow-y-auto')
  })

  it('gives markdown headings stable ids so help sections can be deep-linked (#789)', () => {
    renderPage(['/help/dice-rolling'])

    expect(document.getElementById('inline-notation')).toBeInTheDocument()
    expect(document.getElementById('inline-notation')?.textContent).toBe('Inline notation')
  })

  it('scrolls the article to the hashed section (#789)', () => {
    const scrollIntoView = vi.fn()
    const original = window.HTMLElement.prototype.scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      renderPage(['/help/dice-rolling#inline-notation'])

      expect(scrollIntoView).toHaveBeenCalled()
      // Called on the heading itself, not on some unrelated node.
      expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('inline-notation'))
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original
    }
  })

  it('ignores a hash that matches no heading (#789)', () => {
    const scrollIntoView = vi.fn()
    const original = window.HTMLElement.prototype.scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      renderPage(['/help/dice-rolling#no-such-section'])

      expect(scrollIntoView).not.toHaveBeenCalled()
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original
    }
  })

  it('does not throw on a mangled hash (#789)', () => {
    // `#%` would blow up a decodeURIComponent() call.
    expect(() => renderPage(['/help/dice-rolling#%'])).not.toThrow()
  })

  it('decodes a percent-encoded fragment before looking the heading up (#789)', () => {
    // cspell:ignore Dnotation
    const scrollIntoView = vi.fn()
    const original = window.HTMLElement.prototype.scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView

    try {
      renderPage(['/help/dice-rolling#inline%2Dnotation'])

      expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('inline-notation'))
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original
    }
  })

  it('returns the article to the top when the hash is dropped (#789)', () => {
    renderPage(['/help/dice-rolling#inline-notation'])
    const article = screen.getByRole('main')
    article.scrollTop = 500

    // The sidebar links to the bare topic, which keeps this pane mounted.
    fireEvent.click(screen.getAllByRole('link', { name: 'Dice Rolling' })[0])

    expect(article.scrollTop).toBe(0)
  })
})
