import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const HEADERS_PATH = path.resolve(__dirname, '../public/_headers')

// Split the CSP into directive -> source list so every assertion targets the
// directive that actually governs the request. Asserting `toContain` against
// the whole header line passes even when a host sits in the wrong directive,
// which is how the missing GA4 collection hosts shipped (#279): the beacon
// hosts were absent from `connect-src` while `script-src` made the tag load.
function readCsp(): Record<string, string[]> {
  const content = fs.readFileSync(HEADERS_PATH, 'utf-8')
  const cspLine = content.split('\n').find(line => line.includes('Content-Security-Policy:'))
  expect(cspLine).toBeDefined()

  return Object.fromEntries(
    cspLine!
      .replace('Content-Security-Policy:', '')
      .split(';')
      .map(directive => directive.trim().split(/\s+/))
      .filter(parts => parts.length > 1)
      .map(([name, ...sources]) => [name, sources]),
  )
}

describe('Security Headers (public/_headers)', () => {
  it('allows the Realtime / WebSocket and API origins on connect-src', () => {
    const csp = readCsp()
    expect(csp['connect-src']).toContain("'self'")
    expect(csp['connect-src']).toContain('https://*.supabase.co')
    expect(csp['connect-src']).toContain('wss://*.supabase.co')
    expect(csp['connect-src']).toContain('https://*.sentry.io')
  })

  it('allows every origin gtag.js reports measurements to on connect-src', () => {
    // gtag.js builds hit URLs on `analytics.google.com` (and its region
    // subdomains) and fetches the geo lookup from `www.google.com`; the
    // classic `google-analytics.com` endpoint is still used as a fallback.
    // Google's documented GA4 CSP requires all three source groups.
    const csp = readCsp()
    expect(csp['connect-src']).toContain('https://*.google-analytics.com')
    expect(csp['connect-src']).toContain('https://www.googletagmanager.com')
    expect(csp['connect-src']).toContain('https://*.google.com')
  })

  it('allows the GA beacon origins on img-src', () => {
    const csp = readCsp()
    expect(csp['img-src']).toContain('https://www.googletagmanager.com')
    expect(csp['img-src']).toContain('https://*.google-analytics.com')
  })

  it('allows the NPC portrait CDN (Iconify) for images and search', () => {
    const csp = readCsp()
    expect(csp['img-src']).toContain('https://api.iconify.design')
    expect(csp['connect-src']).toContain('https://api.iconify.design')
  })

  it('allows the required avatar image origins on img-src', () => {
    const csp = readCsp()
    expect(csp['img-src']).toContain('https://*.supabase.co')
    expect(csp['img-src']).toContain('https://*.googleusercontent.com')
    expect(csp['img-src']).toContain('https://avatars.githubusercontent.com')
    expect(csp['img-src']).toContain('https://cdn.discordapp.com')
  })

  it('allows script execution for Vite module preload, theme script, and gtag.js', () => {
    const csp = readCsp()
    expect(csp['script-src']).toContain("'self'")
    expect(csp['script-src']).toContain("'unsafe-inline'")
    expect(csp['script-src']).toContain('https://www.googletagmanager.com')
  })

  it('allows the bundled stylesheet and inline styles on style-src', () => {
    const csp = readCsp()
    expect(csp['style-src']).toContain("'self'")
    expect(csp['style-src']).toContain("'unsafe-inline'")
  })

  it('allows the service worker and blob workers on worker-src', () => {
    const csp = readCsp()
    expect(csp['worker-src']).toContain("'self'")
    expect(csp['worker-src']).toContain('blob:')
  })

  it('clickjacking protection: who may embed the app in a frame (#305)', () => {
    const csp = readCsp()
    expect(csp['frame-ancestors']).toEqual(["'self'"])
  })

  it('classic escalation primitives closed (SEC-7, #402): <base> hijack, off-site form posts, plugin content', () => {
    const csp = readCsp()
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['form-action']).toEqual(["'self'"])
    expect(csp['object-src']).toEqual(["'none'"])
  })

  it('sets X-Frame-Options to SAMEORIGIN for legacy browsers', () => {
    const content = fs.readFileSync(HEADERS_PATH, 'utf-8')
    const xfoLine = content.split('\n').find(line => line.includes('X-Frame-Options:'))
    expect(xfoLine).toBeDefined()
    expect(xfoLine!.split('X-Frame-Options:')[1].trim()).toBe('SAMEORIGIN')
  })
})
