import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { AboutPage } from './AboutPage'

function BackProbe() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)} data-testid="back-probe">
      back
    </button>
  )
}

describe('AboutPage', () => {
  it('renders attribution, donation badges, and GitHub link', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'About Role by Post' })).toBeInTheDocument()
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
    expect(screen.getByRole('link', { name: 'Role by Post on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/alvarocavalcanti/ttrpgpbp'
    )
  })

  it('replaces the entry when returning to lobby so back does not re-enter the page', () => {
    render(
      <MemoryRouter initialEntries={['/about']}>
        <Routes>
          <Route path="/about" element={<AboutPage />} />
          <Route path="/" element={<BackProbe />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('link', { name: 'Back' }))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('back-probe'))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()
  })
})
