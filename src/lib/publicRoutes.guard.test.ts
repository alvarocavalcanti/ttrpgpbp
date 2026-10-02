import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  APP_ROUTE_KEYS,
  PUBLIC_DYNAMIC_ROUTE_KEYS,
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
    // stays green. Derive the expected set from ROUTES itself, excluding the
    // public routes and the dynamic templates whose concrete instances are
    // prerendered (e.g. /help/:topic -> one entry per help slug).
    const publicPaths = new Set(PUBLIC_ROUTES.map((route) => route.path))
    const dynamicPublicPaths = new Set(PUBLIC_DYNAMIC_ROUTE_KEYS.map((key) => ROUTES[key]))
    const expected = Object.entries(ROUTES)
      .filter(
        ([, path]) =>
          path !== ROUTES.notFound && !publicPaths.has(path) && !dynamicPublicPaths.has(path),
      )
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

  it('does not shadow any public asset with an app-shell rewrite', () => {
    // Redirects run before static assets on Cloudflare Pages, so a splat such
    // as `/help/*` would also capture `/help/logo.png` and serve the shell
    // instead of the image (issue #643 follow-up: broken help screenshots).
    const assetPaths: string[] = []
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, `${prefix}/${entry}`)
        else assetPaths.push(`${prefix}/${entry}`)
      }
    }
    walk(join(root, 'public'), '')

    const shadowing = appRedirectRules()
      .filter((rule) => rule.source.includes('*'))
      .map((rule) => rule.source.slice(0, rule.source.indexOf('*')))
      .flatMap((prefix) => assetPaths.filter((asset) => asset.startsWith(prefix)).map((asset) => `${asset} shadowed by ${prefix}*`))
    expect(shadowing).toEqual([])
  })
})
