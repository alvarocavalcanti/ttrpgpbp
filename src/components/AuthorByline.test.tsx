import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthorByline } from './AuthorByline'

describe('AuthorByline', () => {
  it('credits the author and links to the About page', () => {
    render(
      <MemoryRouter>
        <AuthorByline />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Written by/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Alvaro Cavalcanti' })
    expect(link).toHaveAttribute('href', '/about')
  })
})
