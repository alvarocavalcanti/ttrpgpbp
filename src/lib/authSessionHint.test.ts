import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AUTH_STORAGE_KEY_PATTERN, hasPersistedSession, isAuthStorageKey } from './authSessionHint'

describe('authSessionHint', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('matches Supabase session keys, including chunked suffixes', () => {
    expect(isAuthStorageKey('sb-abcdefgh-auth-token')).toBe(true)
    expect(isAuthStorageKey('sb-127-auth-token')).toBe(true)
    expect(isAuthStorageKey('sb-abcdefgh-auth-token.0')).toBe(true)
    expect(isAuthStorageKey('sb-abcdefgh-auth-token.12')).toBe(true)
  })

  it('ignores unrelated and PKCE keys', () => {
    expect(isAuthStorageKey('sb-abcdefgh-auth-token-code-verifier')).toBe(false)
    expect(isAuthStorageKey('sb-abcdefgh-auth-token-extra')).toBe(false)
    expect(isAuthStorageKey('rolebypost-theme')).toBe(false)
    expect(isAuthStorageKey('')).toBe(false)
  })

  it('detects a persisted session in localStorage', () => {
    expect(hasPersistedSession()).toBe(false)
    localStorage.setItem('sb-test-auth-token', '{}')
    expect(hasPersistedSession()).toBe(true)
  })

  it('returns false when storage access throws', () => {
    localStorage.setItem('anything', 'value')
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    expect(hasPersistedSession()).toBe(false)
  })

  it('keeps the inline index.html detection script in sync', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    // The inline pre-paint script duplicates the key pattern and the marker
    // attribute; if either changes, the helper must change with it.
    expect(html).toContain('sb-.*-auth-token')
    expect(html).toContain('data-auth-pending')
    // The hide is scoped to `/`; public pages must keep their prerendered
    // content (CodeRabbit #659).
    expect(html).toContain("location.pathname !== '/'")
    expect(AUTH_STORAGE_KEY_PATTERN.source).toContain('sb-.*-auth-token')
  })
})
