import { describe, it, expect } from 'vitest'
import {
  buildRobots,
  buildSitemap,
  canonicalUrl,
  escapeXml,
  siteJsonLd,
} from './seo'

const SITE = 'https://rolebypost.com'

describe('canonicalUrl', () => {
  it('keeps the trailing slash on the root and none elsewhere', () => {
    expect(canonicalUrl(SITE, '/')).toBe('https://rolebypost.com/')
    expect(canonicalUrl(SITE, '/features')).toBe('https://rolebypost.com/features')
    expect(canonicalUrl('https://rolebypost.com/', '/features')).toBe(
      'https://rolebypost.com/features',
    )
  })
})

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml('a & b < c > d " e \' f')).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f')
  })
})

describe('buildSitemap', () => {
  it('emits a urlset with every route and an absolute location', () => {
    const xml = buildSitemap(
      [
        { path: '/', changeFrequency: 'weekly', priority: 1 },
        { path: '/features', changeFrequency: 'monthly', priority: 0.8 },
      ],
      SITE,
      '2026-10-01',
    )
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<loc>https://rolebypost.com/</loc>')
    expect(xml).toContain('<loc>https://rolebypost.com/features</loc>')
    expect(xml).toContain('<lastmod>2026-10-01</lastmod>')
    expect(xml).toContain('<priority>1.0</priority>')
    expect(xml).toContain('<priority>0.8</priority>')
  })
})

describe('buildRobots', () => {
  it('allows crawling, disallows the app surfaces, and points at the sitemap', () => {
    const txt = buildRobots(SITE, ['/login', '/app-shell'])
    expect(txt).toContain('User-agent: *')
    expect(txt).toContain('Allow: /')
    expect(txt).toContain('Disallow: /login')
    expect(txt).toContain('Disallow: /app-shell')
    expect(txt).toContain('Sitemap: https://rolebypost.com/sitemap.xml')
  })
})

describe('siteJsonLd', () => {
  it('declares Organization, WebSite, and a free GameApplication', () => {
    const graph = siteJsonLd(SITE)
    const types = graph.map((node) => node['@type'])
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication'])
    const app = graph.find((node) => node['@type'] === 'SoftwareApplication')
    expect(app?.applicationCategory).toBe('GameApplication')
    expect(app?.isAccessibleForFree).toBe(true)
    expect(app).toMatchObject({ url: 'https://rolebypost.com/' })
  })
})
