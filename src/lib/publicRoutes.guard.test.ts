import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  APP_ROUTE_KEYS,
  PUBLIC_ROUTES,
  ROUTES,
  appRedirectRules,
  buildRedirectsFile,
} from './publicRoutes'

const root = process.cwd()
const appSource = readFileSync(join(root, 'src', 'App.tsx'), 'utf8')
const redirects = readFileSync(join(root, 'public', '_redirects'), 'utf8')

// Strong guard (issue #643): a 404.html disables Pages' SPA fallback, so any
// app route missing from public/_redirects silently returns the 404 page on
// reload/deep link — a production-only break. These tests fail CI instead.

describe('App.tsx route wiring', () => {
  it('declares no hardcoded route paths', () => {
    const literals = [...appSource.matchAll(/<Route\b[^>]*\bpath="([^"]*)"/g)].map(
      (match) => match[1],
    )
    expect(literals).toEqual([])
  })

  it('wires every ROUTES entry through the registry constant', () => {
    const used = new Set(
      [...appSource.matchAll(/<Route\b[^>]*\bpath=\{ROUTES\.(\w+)\}/g)].map((match) => match[1]),
    )
    expect([...used].sort()).toEqual(Object.keys(ROUTES).sort())
  })
})

describe('public/_redirects', () => {
  it('covers every non-public ROUTES key, not just the listed ones', () => {
    // The drift that matters: someone adds a ROUTES entry + <Route> but forgets
    // APP_ROUTE_KEYS, so its production deep link 404s while every other guard
    // stays green. Derive the expected set from ROUTES itself.
    const publicPaths = new Set(PUBLIC_ROUTES.map((route) => route.path))
    const expected = Object.entries(ROUTES)
      .filter(([, path]) => path !== ROUTES.notFound && !publicPaths.has(path))
      .map(([key]) => key)
      .sort()
    expect([...APP_ROUTE_KEYS].sort()).toEqual(expected)
  })

  it('is exactly what the generator produces (no drift)', () => {
    expect(redirects).toBe(buildRedirectsFile())
  })

  it('rewrites every app route to the shell and never uses a catch-all', () => {
    const sources = appRedirectRules().map((rule) => rule.source)
    for (const rule of appRedirectRules()) {
      expect(redirects).toContain(`${rule.source} ${rule.destination} ${rule.status}`)
    }
    expect(redirects).not.toMatch(/^\/\* /m)
    expect(sources).toHaveLength(APP_ROUTE_KEYS.length)
  })

  it('targets the trailing-slash shell so Pages serves it in place (200)', () => {
    for (const line of redirects.trim().split('\n')) {
      expect(line).toMatch(/ \/app-shell\/ 200$/)
    }
  })
})
