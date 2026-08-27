import { describe, it, expect } from 'vitest'
import { toError } from './errors'

describe('toError', () => {
  it('returns Error instances unchanged', () => {
    const err = new Error('boom')
    expect(toError(err)).toBe(err)
  })

  it('wraps objects that carry a string message', () => {
    const err = toError({ message: 'boom' } as unknown)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
  })

  it('stringifies values without a message', () => {
    expect(toError('bad').message).toBe('bad')
    expect(toError(42).message).toBe('42')
    expect(toError(null).message).toBe('null')
  })
})
