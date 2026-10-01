import { describe, it, expect } from 'vitest'
import {
  APP_ROUTE_KEYS,
  PUBLIC_ROUTES,
  ROUTES,
  appRedirectRules,
  buildRedirectsFile,
  isMarketingPath,
  robotsDisallowPaths,
} from './publicRoutes'

describe('isMarketingPath', () => {
  it('matches the marketing routes with and without a trailing slash', () => {
    expect(isMarketingPath('/')).toBe(true)
    expect(isMarketingPath('/features')).toBe(true)
    expect(isMarketingPath('/features/')).toBe(true)
    expect(isMarketingPath('/privacy')).toBe(true)
    expect(isMarketingPath('/terms')).toBe(true)
  })

  it('rejects app, sibling, and lookalike routes', () => {
    expect(isMarketingPath('/login')).toBe(false)
    expect(isMarketingPath('/channel/abc')).toBe(false)
    expect(isMarketingPath('/features-extra')).toBe(false)
    expect(isMarketingPath('/features/x')).toBe(false)
    expect(isMarketingPath('/changelog')).toBe(false)
  })
})

describe('PUBLIC_ROUTES', () => {
  it('lists the four prerendered public routes exactly once', () => {
    expect(PUBLIC_ROUTES.map((route) => route.path)).toEqual([
      '/',
      '/features',
      '/privacy',
      '/terms',
    ])
  })

  it('gives every route a distinct title, description, and wait selector', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.path.startsWith('/')).toBe(true)
      expect(route.title.length).toBeGreaterThan(0)
      expect(route.description.length).toBeGreaterThan(0)
      expect(route.waitSelector.length).toBeGreaterThan(0)
    }
    expect(new Set(PUBLIC_ROUTES.map((route) => route.title)).size).toBe(PUBLIC_ROUTES.length)
  })
})

describe('appRedirectRules', () => {
  it('covers every app route the router declares', () => {
    expect(APP_ROUTE_KEYS).toEqual([
      'login',
      'archived',
      'messages',
      'admin',
      'adminChannel',
      'join',
      'channel',
      'settings',
      'help',
      'helpTopic',
      'changelog',
      'about',
    ])
  })

  it('rewrites static routes to the shell and collapses dynamic ones to splats', () => {
    const rules = appRedirectRules()
    const bySource = Object.fromEntries(rules.map((rule) => [rule.source, rule.destination]))
    expect(bySource['/login']).toBe('/app-shell/')
    expect(bySource['/admin']).toBe('/app-shell/')
    expect(bySource['/channel/*']).toBe('/app-shell/')
    expect(bySource['/join/*']).toBe('/app-shell/')
    expect(bySource['/help/*']).toBe('/app-shell/')
    expect(bySource['/admin/channels/*']).toBe('/app-shell/')
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
})

describe('ROUTES', () => {
  it('keeps the landing route at the root', () => {
    expect(ROUTES.home).toBe('/')
  })
})
