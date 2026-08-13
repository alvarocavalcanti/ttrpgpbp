import { describe, it, expect } from 'vitest'
import { evaluateDeletion } from './logic.ts'

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
