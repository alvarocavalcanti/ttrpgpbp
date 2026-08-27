import { describe, it, expect } from 'vitest'
import { ServerMessageSchema, ReactionRowSchema, parseServerMessage } from './validation'

const validRow = {
  id: 'm1', channel_id: 'c1', sender_id: 'u1', content: 'hello', type: 'regular',
  whisper_to: null, reply_to: null, npc_name: null, npc_avatar_url: null,
  is_deleted: false, is_edited: false, created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z', roll_dc: null, roll_success: null,
}

describe('ServerMessageSchema', () => {
  it('accepts a complete row', () => {
    expect(ServerMessageSchema.safeParse(validRow).success).toBe(true)
  })

  it('accepts joined embeds as object or array and normalizes them', () => {
    const withArray = { ...validRow, sender: [{ display_name: 'Hero', avatar_url: null }] }
    const withObject = { ...validRow, sender: { display_name: 'Hero', avatar_url: null } }
    expect(parseServerMessage(withArray)?.sender).toEqual({ display_name: 'Hero', avatar_url: null })
    expect(parseServerMessage(withObject)?.sender).toEqual({ display_name: 'Hero', avatar_url: null })
  })

  it('rejects rows missing required fields', () => {
    expect(ServerMessageSchema.safeParse({ id: 'm1' }).success).toBe(false)
    expect(ServerMessageSchema.safeParse({ ...validRow, content: null }).success).toBe(false)
    expect(ServerMessageSchema.safeParse({ ...validRow, created_at: 42 }).success).toBe(false)
  })

  it('returns null from parseServerMessage for malformed input', () => {
    expect(parseServerMessage(null)).toBeNull()
    expect(parseServerMessage({ id: 'm1' })).toBeNull()
  })
})

describe('ReactionRowSchema', () => {
  it('accepts a complete row', () => {
    const row = { id: 'r1', channel_id: 'c1', created_at: '', emoji: '👍', message_id: 'm1', user_id: 'u1' }
    expect(ReactionRowSchema.safeParse(row).success).toBe(true)
  })

  it('rejects rows missing required fields', () => {
    expect(ReactionRowSchema.safeParse({ id: 'r1', emoji: '👍' }).success).toBe(false)
  })
})