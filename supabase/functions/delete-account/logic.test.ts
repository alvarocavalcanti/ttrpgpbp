import { describe, it, expect } from 'vitest'
import { evaluateDeletion, isAllowedOrigin } from './logic.ts'

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
