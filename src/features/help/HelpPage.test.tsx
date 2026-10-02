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
    expect(screen.getByRole('link', { name: 'Play-by-Post' })).toHaveAttribute(
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
})
