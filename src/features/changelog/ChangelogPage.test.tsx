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
    // state) — the top heading is the latest merge date.
    expect(screen.getByRole('heading', { name: /^\d{4}-\d{2}-\d{2}$/ })).toBeInTheDocument()
  })
})
