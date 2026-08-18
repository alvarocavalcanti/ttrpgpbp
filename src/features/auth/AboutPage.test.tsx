import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AboutPage } from './AboutPage'

describe('AboutPage', () => {
  it('renders attribution, donation badges, and GitHub link', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'About RoleByPost' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Alvaro Cavalcanti' })).toHaveAttribute(
      'href',
      'https://memorablenaton.es'
    )
    const buyMeACoffee = screen.getByRole('link', { name: 'Buy Me A Coffee' })
    expect(buyMeACoffee).toHaveAttribute('target', '_blank')
    expect(buyMeACoffee).toHaveAttribute('rel', 'noreferrer')
    expect(screen.getByRole('img', { name: 'Buy Me A Coffee' })).toHaveAttribute(
      'src',
      'https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png'
    )
    const koFi = screen.getByRole('link', { name: 'Buy Me a Coffee at ko-fi.com' })
    expect(koFi).toHaveAttribute('target', '_blank')
    expect(koFi).toHaveAttribute('rel', 'noreferrer')
    expect(screen.getByRole('img', { name: 'Buy Me a Coffee at ko-fi.com' })).toHaveAttribute(
      'src',
      'https://storage.ko-fi.com/cdn/kofi6.png?v=6'
    )
    expect(screen.getByRole('link', { name: 'RoleByPost on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/alvarocavalcanti/ttrpgpbp'
    )
  })
})
