import { describe, it, expect } from 'vitest'
import {
  APP_ROUTE_KEYS,
  HELP_TOPICS,
  PUBLIC_ROUTES,
  ROUTES,
  appRedirectRules,
  buildRedirectsFile,
  isMarketingPath,
  normalizePath,
  robotsDisallowPaths,
} from './publicRoutes'

describe('normalizePath', () => {
  it('strips a single trailing slash but keeps the root', () => {
    expect(normalizePath('/play-by-post/')).toBe('/play-by-post')
    expect(normalizePath('/help/dice-rolling/')).toBe('/help/dice-rolling')
    expect(normalizePath('/features')).toBe('/features')
    expect(normalizePath('/')).toBe('/')
  })
})

describe('isMarketingPath', () => {
  it('matches the always-marketing routes with and without a trailing slash', () => {
    expect(isMarketingPath('/features')).toBe(true)
    expect(isMarketingPath('/features/')).toBe(true)
    expect(isMarketingPath('/privacy')).toBe(true)
    expect(isMarketingPath('/terms')).toBe(true)
  })

  it('matches the content pages and every help topic', () => {
    expect(isMarketingPath('/play-by-post')).toBe(true)
    expect(isMarketingPath('/how-to/play-by-post-dnd')).toBe(true)
    expect(isMarketingPath('/how-to/run-play-by-post')).toBe(true)
    expect(isMarketingPath('/vs/discord')).toBe(true)
    expect(isMarketingPath('/alternatives/rpol')).toBe(true)
    expect(isMarketingPath('/alternatives/myth-weavers')).toBe(true)
    expect(isMarketingPath('/help')).toBe(true)
    expect(isMarketingPath('/help/dice-rolling')).toBe(true)
    expect(isMarketingPath('/help/dice-rolling/')).toBe(true)
  })

  it('rejects the landing, app, sibling, and lookalike routes', () => {
    // `/` is the lobby once signed in, so callers decide on it with auth state.
    expect(isMarketingPath('/')).toBe(false)
    expect(isMarketingPath('/login')).toBe(false)
    expect(isMarketingPath('/channel/abc')).toBe(false)
    expect(isMarketingPath('/features-extra')).toBe(false)
    expect(isMarketingPath('/features/x')).toBe(false)
    expect(isMarketingPath('/changelog')).toBe(false)
    expect(isMarketingPath('/helpful')).toBe(false)
  })
})

describe('PUBLIC_ROUTES', () => {
  it('lists every prerendered route in a stable order', () => {
    expect(PUBLIC_ROUTES.map((route) => route.path)).toEqual([
      '/',
      '/features',
      '/dice-roller',
      '/play-by-post',
      '/how-to/play-by-post-dnd',
      '/how-to/run-play-by-post',
      '/vs/discord',
      '/alternatives/rpol',
      '/alternatives/myth-weavers',
      '/help',
      ...HELP_TOPICS.map((topic) => `/help/${topic.slug}`),
      '/privacy',
      '/terms',
    ])
  })

  it('gives every route a unique path and title, plus metadata', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.path.startsWith('/')).toBe(true)
      expect(route.title.length).toBeGreaterThan(0)
      expect(route.description.length).toBeGreaterThan(0)
      expect(route.waitSelector.length).toBeGreaterThan(0)
    }
    expect(new Set(PUBLIC_ROUTES.map((route) => route.path)).size).toBe(PUBLIC_ROUTES.length)
    expect(new Set(PUBLIC_ROUTES.map((route) => route.title)).size).toBe(PUBLIC_ROUTES.length)
  })

  it('stores plain, un-escaped titles', () => {
    // verify-prerender decodes HTML entities before comparing, so titles may
    // contain `&` (e.g. "D&D") but must never be pre-escaped.
    for (const route of PUBLIC_ROUTES) {
      expect(route.title).not.toContain('&amp;')
    }
  })
})

describe('APP_ROUTE_KEYS', () => {
  it('no longer lists the public help routes', () => {
    expect(APP_ROUTE_KEYS).toEqual([
      'login',
      'archived',
      'messages',
      'admin',
      'adminChannel',
      'join',
      'channel',
      'settings',
      'changelog',
      'about',
    ])
  })
})

describe('appRedirectRules', () => {
  it('rewrites static routes to the shell and collapses dynamic ones to splats', () => {
    const rules = appRedirectRules()
    const bySource = Object.fromEntries(rules.map((rule) => [rule.source, rule.destination]))
    expect(bySource['/login']).toBe('/app-shell/')
    expect(bySource['/admin']).toBe('/app-shell/')
    expect(bySource['/channel/*']).toBe('/app-shell/')
    expect(bySource['/join/*']).toBe('/app-shell/')
    expect(bySource['/admin/channels/*']).toBe('/app-shell/')
    // The help splat must not exist: it would shadow the prerendered pages.
    expect(bySource['/help/*']).toBeUndefined()
    expect(bySource['/help']).toBeUndefined()
    expect(rules.every((rule) => rule.status === 200)).toBe(true)
  })

  it('places static rules before dynamic ones and never uses a catch-all', () => {
    const sources = appRedirectRules().map((rule) => rule.source)
    const firstDynamic = sources.findIndex((source) => source.includes('*'))
    expect(firstDynamic).toBeGreaterThan(-1)
    expect(sources.slice(firstDynamic).every((source) => source.includes('*'))).toBe(true)
    expect(sources).not.toContain('/*')
  })

  it('renders the file Cloudflare expects', () => {
    const lines = buildRedirectsFile().trim().split('\n')
    expect(lines).toContain('/login /app-shell/ 200')
    expect(lines).toContain('/channel/* /app-shell/ 200')
    expect(buildRedirectsFile().endsWith('\n')).toBe(true)
  })
})

describe('robotsDisallowPaths', () => {
  it('covers the app prefixes and the shell, without duplicates', () => {
    const paths = robotsDisallowPaths()
    expect(paths).toContain('/login')
    expect(paths).toContain('/admin')
    expect(paths).toContain('/channel')
    expect(paths).toContain('/app-shell')
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('does not disallow the public help routes', () => {
    const paths = robotsDisallowPaths()
    expect(paths).not.toContain('/help')
    expect(paths.some((path) => path.startsWith('/help'))).toBe(false)
  })
})

describe('ROUTES', () => {
  it('keeps the landing route at the root', () => {
    expect(ROUTES.home).toBe('/')
  })
})
