import { describe, it, expect } from 'vitest'
import {
  articleJsonLd,
  breadcrumbJsonLd,
  howToJsonLd,
  jsonLdForRoute,
  serializeJsonLd,
} from './structuredData'
import { CONTENT_ROUTES } from './contentRoutes'
import { PUBLIC_ROUTES } from './publicRoutes'

const SITE = 'https://rolebypost.com'

describe('breadcrumbJsonLd', () => {
  it('drops non-link grouping crumbs and links every remaining item', () => {
    const node = breadcrumbJsonLd(
      [{ label: 'Home', to: '/' }, { label: 'How-to Guides' }, { label: 'A Guide' }],
      '/how-to/a-guide',
      SITE,
    )
    const items = node.itemListElement as Array<Record<string, unknown>>
    // Google requires an item URL on every crumb but the last, so the
    // unlinked "How-to Guides" group is omitted from the schema.
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ position: 1, name: 'Home', item: 'https://rolebypost.com/' })
    expect(items[1]).toMatchObject({
      position: 2,
      name: 'A Guide',
      item: 'https://rolebypost.com/how-to/a-guide',
    })
    for (const item of items) expect(item.item).toBeTruthy()
  })
})

describe('serializeJsonLd', () => {
  it('escapes `<` so a value cannot close the script tag early', () => {
    const html = serializeJsonLd([
      { '@context': 'https://schema.org', '@type': 'Thing', name: '</script><script>alert(1)</script>' },
    ])
    expect(html).toContain('<script type="application/ld+json">')
    expect(html).toContain('\\u003c/script>')
    // Exactly one real closing tag — the wrapper's own.
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).not.toContain('<script>alert')
  })
})

describe('articleJsonLd', () => {
  it('declares an Article with the site author', () => {
    const node = articleJsonLd({
      headline: 'Play-by-Post',
      description: 'A guide',
      url: 'https://rolebypost.com/play-by-post',
    })
    expect(node['@type']).toBe('Article')
    expect(node).toMatchObject({
      headline: 'Play-by-Post',
      description: 'A guide',
      url: 'https://rolebypost.com/play-by-post',
    })
    expect(node.author).toMatchObject({ '@type': 'Person', name: 'Alvaro Cavalcanti' })
  })
})

describe('howToJsonLd', () => {
  it('numbers the HowTo steps in order', () => {
    const node = howToJsonLd({
      name: 'A How-To',
      description: 'How to do it',
      url: 'https://rolebypost.com/how-to/a',
      steps: [
        { name: 'First', text: 'Do the first thing' },
        { name: 'Second', text: 'Do the second thing' },
      ],
    })
    expect(node['@type']).toBe('HowTo')
    const steps = node.step as Array<Record<string, unknown>>
    expect(steps.map((s) => [s.position, s.name])).toEqual([
      [1, 'First'],
      [2, 'Second'],
    ])
  })
})

describe('jsonLdForRoute', () => {
  it('keeps the landing and features schemas', () => {
    expect(jsonLdForRoute('/', SITE).map((n) => n['@type'])).toEqual([
      'Organization',
      'WebSite',
      'SoftwareApplication',
    ])
    expect(jsonLdForRoute('/features', SITE).map((n) => n['@type'])).toEqual(['FAQPage'])
  })

  it('declares the public dice roller as a free WebApplication', () => {
    const nodes = jsonLdForRoute('/dice-roller', SITE)
    expect(nodes.map((n) => n['@type'])).toEqual(['WebApplication', 'BreadcrumbList'])
    expect(nodes[0]).toMatchObject({ isAccessibleForFree: true })
  })

  it('emits Article + BreadcrumbList for a game-system page', () => {
    const nodes = jsonLdForRoute('/game-systems/shadowdark', SITE)
    expect(nodes.map((n) => n['@type'])).toEqual(['Article', 'BreadcrumbList'])
    const crumbs = nodes[1].itemListElement as Array<Record<string, unknown>>
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'Shadowdark Play-by-Post'])
  })

  it('emits HowTo + BreadcrumbList for the how-to guides', () => {
    const types = jsonLdForRoute('/how-to/run-play-by-post', SITE).map((n) => n['@type'])
    expect(types).toEqual(['HowTo', 'BreadcrumbList'])
  })

  it('emits Article + BreadcrumbList for the pillar and comparison pages', () => {
    for (const path of ['/play-by-post', '/vs/discord', '/alternatives/rpol', '/alternatives/myth-weavers']) {
      const types = jsonLdForRoute(path, SITE).map((n) => n['@type'])
      expect(types).toEqual(['Article', 'BreadcrumbList'])
    }
  })

  it('emits only a BreadcrumbList for the help index', () => {
    // The index renders the first topic as its H1, so an Article titled
    // "Help and Guides" would not describe the visible content.
    expect(jsonLdForRoute('/help', SITE).map((n) => n['@type'])).toEqual(['BreadcrumbList'])
  })

  it('emits Article + BreadcrumbList for help topics', () => {
    const topic = jsonLdForRoute('/help/dice-rolling', SITE)
    expect(topic.map((n) => n['@type'])).toEqual(['Article', 'BreadcrumbList'])
    const crumbs = topic[1].itemListElement as Array<Record<string, unknown>>
    expect(crumbs.map((c) => c.name)).toEqual([
      'Home',
      'Help',
      'Dice Rolling — Role by Post Help',
    ])
  })

  it('returns nothing for routes without schema', () => {
    expect(jsonLdForRoute('/privacy', SITE)).toEqual([])
    expect(jsonLdForRoute('/terms', SITE)).toEqual([])
    expect(jsonLdForRoute('/does-not-exist', SITE)).toEqual([])
  })

  it('keeps the content-route registry aligned with the public routes', () => {
    const publicPaths = new Set(PUBLIC_ROUTES.map((route) => route.path))
    for (const route of CONTENT_ROUTES) {
      expect(publicPaths.has(route.path)).toBe(true)
    }
  })
})
