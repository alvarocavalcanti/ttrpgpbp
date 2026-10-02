import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AuthorByline } from './AuthorByline'

describe('AuthorByline', () => {
  it('credits the author with a link to their public profile', () => {
    render(<AuthorByline />)
    expect(screen.getByText(/Written by/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Alvaro Cavalcanti' })
    // The app's /about is auth-gated, so the byline links to the author's own
    // public site instead of bouncing signed-out readers to /login.
    expect(link).toHaveAttribute('href', 'https://memorablenaton.es')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
