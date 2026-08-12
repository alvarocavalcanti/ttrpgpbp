import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashPassword, hashPasswordWithSalt, hashPasswordLegacy } from './crypto'

// jsdom has crypto.getRandomValues but not crypto.subtle, so mock subtle and
// (optionally) the random salt source to keep assertions deterministic.
function installCryptoMock(salts: Uint8Array[] = [new Uint8Array(16)]) {
  let saltIndex = 0
  const getRandomValues = vi.fn((arr: Uint8Array) => {
    const source = salts[saltIndex % salts.length]
    saltIndex += 1
    arr.set(source.subarray(0, arr.byteLength))
    return arr
  })
  const importKey = vi.fn().mockResolvedValue({})
  const deriveBits = vi.fn(async ({ salt }: { salt: Uint8Array }) => {
    const out = new Uint8Array(new ArrayBuffer(32))
    out.fill(salt[0] ?? 0)
    return out.buffer
  })
  const digest = vi.fn().mockResolvedValue(new Uint8Array(32).fill(0x00).buffer)

  Object.defineProperty(window, 'crypto', {
    value: { getRandomValues, subtle: { importKey, deriveBits, digest } },
    configurable: true
  })
  return { getRandomValues, importKey, deriveBits, digest }
}

describe('crypto', () => {
  beforeEach(() => {
    installCryptoMock()
  })

  it('hashPassword derives a PBKDF2 hash with a random salt', async () => {
    const { importKey, deriveBits } = installCryptoMock([new Uint8Array(16).fill(0x01)])
    const result = await hashPassword('secret')

    expect(result.salt).toBe('01'.repeat(16))
    expect(result.hash).toBe('01'.repeat(32))
    expect(importKey).toHaveBeenCalledWith('raw', expect.anything(), 'PBKDF2', false, ['deriveBits'])
    expect(deriveBits).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'PBKDF2', iterations: 210000, hash: 'SHA-256' }),
      expect.anything(),
      256
    )
  })

  it('hashPassword uses a fresh salt on every call', async () => {
    installCryptoMock([new Uint8Array(16).fill(0x01), new Uint8Array(16).fill(0x02)])
    const first = await hashPassword('secret')
    const second = await hashPassword('secret')

    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })

  it('hashPasswordWithSalt derives with the provided salt', async () => {
    const { deriveBits } = installCryptoMock()
    const saltHex = '00112233445566778899aabbccddeeff'

    const hash = await hashPasswordWithSalt('secret', saltHex)

    expect(hash).toBe('00'.repeat(32))
    const saltArg = deriveBits.mock.calls[0][0].salt as Uint8Array
    expect(Array.from(saltArg)).toEqual([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff])
  })

  it('hashPasswordWithSalt re-derives the same hash as hashPassword for the same salt', async () => {
    const { hash, salt } = await hashPassword('secret')

    expect(await hashPasswordWithSalt('secret', salt)).toBe(hash)
  })

  it('hashPasswordLegacy produces an unsalted SHA-256 hex', async () => {
    const { digest } = installCryptoMock()
    const hash = await hashPasswordLegacy('secret')

    expect(hash).toBe('00'.repeat(32))
    expect(digest).toHaveBeenCalledWith('SHA-256', expect.anything())
  })
})
