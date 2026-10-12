import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SiteFooter } from './SiteFooter'

const renderFooter = () =>
  render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>
  )

describe('SiteFooter', () => {
  it('groups the links under five headings', () => {
    renderFooter()
    // The list is rendered twice (desktop columns + mobile disclosure), so each
    // label appears more than once; assert the grouping, not a unique node.
    for (const label of ['Product', 'Guides', 'Compare', 'Company', 'Elsewhere']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
    expect(screen.getAllByText('Help').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Privacy Policy').length).toBeGreaterThan(0)
  })

  it('keeps the Footer navigation landmark', () => {
    renderFooter()
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument()
  })

  it('never renders an h1 (prerender allows exactly one per page)', () => {
    const { container } = renderFooter()
    expect(container.querySelector('h1')).toBeNull()
  })

  it('gives external links a new tab and noreferrer', () => {
    renderFooter()
    const external = screen.getAllByRole('link', { name: 'GitHub' })[0]
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noreferrer')
    const tokenArt = screen.getAllByRole('link', { name: 'You See This — token art' })[0]
    expect(tokenArt).toHaveAttribute('href', 'https://youseethis.blog')
  })

  it('switches desktop columns and the mobile disclosure by CSS, not JS', () => {
    const { container } = renderFooter()
    // DAMP literals: the desktop grid is hidden below md, and the disclosure is
    // hidden from md up. Both are always rendered so prerender === client.
    const desktopGrid = container.querySelector('nav > div')!
    expect(desktopGrid).toHaveClass('hidden')
    expect(desktopGrid).toHaveClass('md:grid')

    const disclosure = screen.getByTestId('footer-disclosure')
    expect(disclosure).toHaveClass('md:hidden')
    // Closed by default: no `open` attribute baked into the markup.
    expect(disclosure).not.toHaveAttribute('open')
  })

  it('closes the mobile disclosure when the backdrop is tapped', () => {
    renderFooter()
    const disclosure = screen.getByTestId('footer-disclosure') as HTMLDetailsElement
    disclosure.open = true

    fireEvent.click(screen.getByTestId('footer-backdrop'))

    expect(disclosure.open).toBe(false)
  })

  it('closes the mobile disclosure on Escape', () => {
    renderFooter()
    const disclosure = screen.getByTestId('footer-disclosure') as HTMLDetailsElement
    disclosure.open = true
    // Sync the component's open state (drives whether Escape is armed).
    fireEvent(disclosure, new Event('toggle'))

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(disclosure.open).toBe(false)
  })
})
