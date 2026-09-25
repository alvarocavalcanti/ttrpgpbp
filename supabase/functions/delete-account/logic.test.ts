import { describe, it, expect } from 'vitest'
import { buildCorsHeaders, evaluateDeletion, isAllowedOrigin, resolveAdminLookup } from './logic.ts'

describe('evaluateDeletion', () => {
  it('allows a non-admin user to delete their account', () => {
    expect(evaluateDeletion(false)).toEqual({ allow: true })
  })

  it('blocks the server admin from self-deleting', () => {
    const result = evaluateDeletion(true)
    expect(result).toEqual({
      allow: false,
      status: 403,
      reason: 'Server admin cannot delete their own account. Transfer admin first.',
    })
  })
})

describe('resolveAdminLookup', () => {
  it('reports the admin flag from a successful lookup', () => {
    expect(resolveAdminLookup({ data: true, error: null })).toEqual({ ok: true, isServerAdmin: true })
    expect(resolveAdminLookup({ data: false, error: null })).toEqual({ ok: true, isServerAdmin: false })
  })

  it('fails closed when the RPC errors', () => {
    expect(resolveAdminLookup({ data: null, error: { message: 'boom' } })).toEqual({ ok: false })
  })

  it('treats a non-true payload as not-admin', () => {
    expect(resolveAdminLookup({ data: null, error: null })).toEqual({ ok: true, isServerAdmin: false })
  })
})

describe('isAllowedOrigin', () => {
  it('allows the default app origins incl. the custom domain', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedOrigin('https://ttrpgpbp.pages.dev')).toBe(true)
    expect(isAllowedOrigin('https://rolebypost.com')).toBe(true)
  })

  it('allows Cloudflare Pages preview subdomains', () => {
    expect(isAllowedOrigin('https://abc123.ttrpgpbp.pages.dev')).toBe(true)
  })

  it('rejects unknown origins', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false)
  })

  it('a non-empty env list replaces the defaults but previews still pass', () => {
    expect(isAllowedOrigin('https://pages.dev', ['https://other.example.com'])).toBe(false)
    expect(isAllowedOrigin('https://other.example.com', ['https://other.example.com'])).toBe(true)
    expect(isAllowedOrigin('https://abc123.ttrpgpbp.pages.dev', ['https://other.example.com'])).toBe(true)
  })

  it('an empty env list falls back to the defaults', () => {
    expect(isAllowedOrigin('https://rolebypost.com', [])).toBe(true)
  })
})

describe('buildCorsHeaders', () => {
  it('allows every header the Supabase browser client sends', () => {
    const allowed = buildCorsHeaders('https://rolebypost.com')['Access-Control-Allow-Headers']
    expect(allowed).toContain('x-client-info')
    expect(allowed).toContain('authorization')
    expect(allowed).toContain('apikey')
    expect(allowed).toContain('content-type')
  })

  it('allows POST and the preflight OPTIONS method', () => {
    const methods = buildCorsHeaders('https://rolebypost.com')['Access-Control-Allow-Methods']
    expect(methods).toContain('POST')
    expect(methods).toContain('OPTIONS')
  })

  it('echoes an allowed origin but not a disallowed one', () => {
    expect(buildCorsHeaders('https://rolebypost.com')['Access-Control-Allow-Origin']).toBe('https://rolebypost.com')
    expect(buildCorsHeaders('https://evil.example.com')['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('omits Allow-Origin when the request has no Origin', () => {
    expect(buildCorsHeaders(null)['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('honours an env allowlist override', () => {
    expect(buildCorsHeaders('https://other.example.com', ['https://other.example.com'])['Access-Control-Allow-Origin']).toBe('https://other.example.com')
    expect(buildCorsHeaders('https://rolebypost.com', ['https://other.example.com'])['Access-Control-Allow-Origin']).toBeUndefined()
  })
})
