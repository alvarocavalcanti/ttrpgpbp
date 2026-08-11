import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HelpPage } from './HelpPage'
import { getGeneralHelp } from './helpContent'

vi.mock('./helpContent', () => ({
  getGeneralHelp: vi.fn()
}))

const entries = [
  { slug: 'dice-rolling', title: 'Dice Rolling', content: '## Inline notation\n\nClick dice.', screenshot: '/help/dice-panel.png' },
  { slug: 'search', title: 'Search', content: '## How to search\n\nType text.' },
]

describe('HelpPage', () => {
  beforeEach(() => {
    vi.mocked(getGeneralHelp).mockReturnValue(entries as any)
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

  it('renders the topic list and first topic content by default', () => {
    renderPage()
    expect(screen.getAllByText('Dice Rolling').length).toBeGreaterThan(0)
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('Inline notation')).toBeInTheDocument()
  })

  it('renders screenshot when entry has one', () => {
    renderPage()
    const img = screen.getByAltText('Dice Rolling screenshot')
    expect(img).toHaveAttribute('src', '/help/dice-panel.png')
  })

  it('shows selected topic content when navigating by slug', () => {
    renderPage(['/help/search'])
    expect(screen.getByText('How to search')).toBeInTheDocument()
    expect(screen.queryByText('Inline notation')).not.toBeInTheDocument()
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
    renderPage()
    expect(screen.getByText(/No help topics available yet/)).toBeInTheDocument()
  })
})
