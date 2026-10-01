import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LandingPage } from './LandingPage'

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  it('renders the hero and the sign-in call to action', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Play your tabletop RPG, one post at a time',
    )
    const signIn = screen.getByRole('link', { name: 'Sign in' })
    expect(signIn).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/login')
  })

  it('does not render the sign-in form', () => {
    renderLanding()
    expect(screen.queryByText('Sign in with Google')).not.toBeInTheDocument()
    expect(screen.queryByText('Email me a sign-in link')).not.toBeInTheDocument()
  })

  it('renders the feature highlights and positioning copy', () => {
    renderLanding()
    expect(screen.getByText('Why Role by Post?')).toBeInTheDocument()
    expect(screen.getByText('Real-time Chat')).toBeInTheDocument()
    expect(screen.getByText('Dice Rolling')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Text-first, no bloat' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Not a VTT' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See all features/ })).toHaveAttribute(
      'href',
      '/features',
    )
  })

  it('renders the creator attribution and legal links', () => {
    renderLanding()
    expect(screen.getByRole('link', { name: 'Alvaro Cavalcanti' })).toHaveAttribute(
      'href',
      'https://memorablenaton.es',
    )
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    )
  })

  it('uses a responsive feature grid', () => {
    const { container } = renderLanding()
    const grids = container.querySelectorAll('.grid')
    const featureGrid = grids[grids.length - 1]
    expect(featureGrid).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3')
  })
})
