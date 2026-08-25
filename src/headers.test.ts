import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Security Headers (public/_headers)', () => {
  it('has a Content-Security-Policy that allows required domains', () => {
    const headersPath = path.resolve(__dirname, '../public/_headers')
    const content = fs.readFileSync(headersPath, 'utf-8')
    
    const cspLine = content.split('\n').find(line => line.includes('Content-Security-Policy:'))
    expect(cspLine).toBeDefined()
    
    // Check required Realtime / WebSocket domains
    expect(cspLine).toContain('connect-src')
    expect(cspLine).toContain('wss://*.supabase.co')
    expect(cspLine).toContain('https://*.supabase.co')
    expect(cspLine).toContain('https://*.sentry.io')

    // Google Analytics beacon endpoint (gtag reports here via fetch/XHR)
    expect(cspLine).toContain('https://*.google-analytics.com')

    // NPC portrait CDN (Iconify) — images load via <img>, search via fetch
    expect(cspLine).toContain('https://api.iconify.design')
    expect(cspLine).toContain('connect-src')
    expect(cspLine).toContain('img-src')

    // Check required image avatars domains
    expect(cspLine).toContain('https://*.supabase.co')
    expect(cspLine).toContain('https://*.googleusercontent.com')
    expect(cspLine).toContain('https://avatars.githubusercontent.com')
    expect(cspLine).toContain('https://cdn.discordapp.com')

    // Check required script execution (for Vite module preload, theme script,
    // and the Google Analytics gtag.js loader)
    expect(cspLine).toContain("script-src 'self' 'unsafe-inline'")
    expect(cspLine).toContain('https://www.googletagmanager.com')
    
    // Check required style execution
    expect(cspLine).toContain("style-src 'self' 'unsafe-inline'")
  })
})
