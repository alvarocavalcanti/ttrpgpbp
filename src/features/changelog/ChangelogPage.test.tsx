import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ChangelogPage } from './ChangelogPage'

describe('ChangelogPage', () => {
  it('renders the full changelog markdown', () => {
    render(
      <MemoryRouter initialEntries={['/changelog']}>
        <Routes>
          <Route path="/changelog" element={<ChangelogPage />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Changelog' })).toBeInTheDocument()
    // CHANGELOG.md is date-stamped (merges ship immediately, no Unreleased
    // state) — it carries one or more dated headings, newest first.
    const dateHeadings = screen.getAllByRole('heading', { name: /^\d{4}-\d{2}-\d{2}$/ })
    expect(dateHeadings.length).toBeGreaterThan(0)
    // Server Admin entries are tagged admin-only in the source and stripped
    // from the player-facing page, while player entries stay.
    expect(screen.queryByText(/Server admins can now act on player reports/)).not.toBeInTheDocument()
    // Same date section, untagged entry: proves the page renders around the gap.
    expect(screen.getByText(/Reload that actually reloads/)).toBeInTheDocument()
    expect(screen.getByText(/formatting toolbar/)).toBeInTheDocument()
  })
})
