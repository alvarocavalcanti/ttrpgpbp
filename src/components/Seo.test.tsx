import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Seo } from './Seo'

function headMeta(selector: string): string | null {
  return document.head.querySelector(selector)?.getAttribute('content') ?? null
}

describe('Seo', () => {
  it('renders the public route metadata from PUBLIC_ROUTES', () => {
    render(<Seo path="/features" />)

    expect(document.title).toBe('Features — Role by Post')
    expect(headMeta('meta[name="description"]')).toContain('play-by-post')
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://rolebypost.com/features',
    )
    expect(headMeta('meta[property="og:title"]')).toBe('Features — Role by Post')
    expect(headMeta('meta[property="og:url"]')).toBe('https://rolebypost.com/features')
    expect(headMeta('meta[property="og:image"]')).toBe('https://rolebypost.com/og-image.png')
    expect(headMeta('meta[name="twitter:card"]')).toBe('summary_large_image')
  })

  it('canonicalises the root with a trailing slash', () => {
    render(<Seo path="/" />)
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://rolebypost.com/',
    )
  })

  it('emits exactly one title', () => {
    render(<Seo path="/terms" />)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
  })

  it('applies noindex and omits the canonical for app routes', () => {
    render(<Seo path="/login" title="Sign in — Role by Post" description="Sign in." noindex />)
    expect(headMeta('meta[name="robots"]')).toBe('noindex')
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull()
    expect(document.title).toBe('Sign in — Role by Post')
  })

  it('renders JSON-LD scripts verbatim', () => {
    const { container } = render(
      <Seo path="/" jsonLd={[{ '@type': 'Organization', name: 'Role by Post' }]} />,
    )
    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script?.textContent).toContain('"@type":"Organization"')
  })
})
