import { describe, it, expect, vi } from 'vitest'
import { hashPassword } from './crypto'

describe('crypto', () => {
  it('hashes password', async () => {
    // Polyfill subtle crypto for jsdom
    const mockDigest = vi.fn().mockResolvedValue(new ArrayBuffer(32))
    Object.defineProperty(window, 'crypto', {
      value: { subtle: { digest: mockDigest } },
      configurable: true
    })
    
    const hash = await hashPassword('password')
    expect(hash).toBe('0000000000000000000000000000000000000000000000000000000000000000')
    expect(mockDigest).toHaveBeenCalled()
  })
})
