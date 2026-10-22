import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkifiedText } from './LinkifiedText'

describe('LinkifiedText', () => {
  it('renders plain text with no anchor', () => {
    const { container } = render(<LinkifiedText text="A weekly Shadowdark game." />)

    expect(screen.getByText('A weekly Shadowdark game.')).toBeInTheDocument()
    expect(container.querySelector('a')).toBeNull()
  })

  it('opens links in a new tab with nofollow ugc', () => {
    render(<LinkifiedText text="Apply at https://example.com/recruit today." />)

    const link = screen.getByRole('link', { name: 'https://example.com/recruit' })
    expect(link).toHaveAttribute('href', 'https://example.com/recruit')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
  })

  it('keeps the surrounding copy and its line breaks in place', () => {
    const { container } = render(<LinkifiedText text={'Line one\nhttps://example.com\nLine three'} />)

    expect(container.textContent).toBe('Line one\nhttps://example.com\nLine three')
    expect(container.querySelectorAll('a')).toHaveLength(1)
  })

  it('renders markup-shaped copy as text, never HTML', () => {
    const { container } = render(<LinkifiedText text="<b>not bold</b> javascript:alert(1)" />)

    expect(screen.getByText('<b>not bold</b> javascript:alert(1)')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })

  it('renders several links', () => {
    render(<LinkifiedText text="https://a.example and https://b.example" />)

    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
})
