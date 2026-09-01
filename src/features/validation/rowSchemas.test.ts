import { describe, it, expect, vi } from 'vitest'
import {
  parseRow,
  normalizeProfileRef,
  ChannelRowSchema,
  ChannelMemberRowSchema,
  ChannelNotificationPrefsSchema,
  SearchMessageRowSchema,
  AdminThreadRowSchema,
  AdminMessageRowSchema,
  ProfileRowSchema,
  RpcCountSchema,
  RpcBooleanSchema,
} from './rowSchemas'

const channel = {
  id: 'c1', name: 'Quest', gm_id: 'u1', is_archived: false, game_system: 'none',
  created_at: '2026-01-01T00:00:00Z', last_message_at: null, extra: 'kept'
}

describe('parseRow', () => {
  it('returns parsed data and keeps unknown keys (loose object)', () => {
    const parsed = parseRow(ChannelRowSchema, channel)
    expect(parsed).toMatchObject({ id: 'c1', extra: 'kept' })
  })

  it('returns null and logs for a malformed row', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(parseRow(ChannelRowSchema, { id: 42 })).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('returns null for null input', () => {
    expect(parseRow(ChannelRowSchema, null)).toBeNull()
  })
})

describe('normalizeProfileRef', () => {
  it('accepts object and array join shapes', () => {
    expect(normalizeProfileRef({ display_name: 'GM', avatar_url: null })).toEqual({ display_name: 'GM', avatar_url: null })
    expect(normalizeProfileRef([{ display_name: 'GM' }])).toEqual({ display_name: 'GM' })
  })

  it('returns null for malformed fragments', () => {
    expect(normalizeProfileRef(42)).toBeNull()
  })
})

describe('member and prefs schemas', () => {
  it('validates a channel_members row', () => {
    const member = {
      id: 'cm1', channel_id: 'c1', user_id: 'u1', character_name: 'Bard',
      character_avatar_url: null, character_sheet_url: null, is_active_player: false,
      is_blocked: false, joined_at: '2026-01-01T00:00:00Z', last_read_at: '2026-01-01T00:00:00Z',
      notify_all_messages: true, notify_gm_messages: true, notify_turn: true
    }
    expect(parseRow(ChannelMemberRowSchema, member)).toMatchObject({ id: 'cm1' })
    expect(parseRow(ChannelMemberRowSchema, { ...member, character_name: 5 })).toBeNull()
  })

  it('validates notification prefs', () => {
    expect(parseRow(ChannelNotificationPrefsSchema, { notify_all_messages: true, notify_gm_messages: false, notify_turn: true })).not.toBeNull()
    expect(parseRow(ChannelNotificationPrefsSchema, { notify_all_messages: 'yes' })).toBeNull()
  })
})

describe('search, admin and profile schemas', () => {
  it('validates a search message row', () => {
    const msg = {
      id: 'm1', channel_id: 'c1', sender_id: 'u1', content: 'hello', type: 'regular',
      is_deleted: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      sender: { display_name: 'GM' }
    }
    expect(parseRow(SearchMessageRowSchema, msg)).toMatchObject({ id: 'm1' })
    expect(parseRow(SearchMessageRowSchema, { ...msg, content: null })).toBeNull()
  })

  it('validates an admin thread row', () => {
    const thread = {
      id: 't1', created_by: 'u1', gm_id: null, subject: 'Help', type: 'support',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      last_message_at: '2026-01-01T00:00:00Z', creator: { display_name: 'A' }, admin_thread_reads: []
    }
    expect(parseRow(AdminThreadRowSchema, thread)).toMatchObject({ id: 't1' })
    expect(parseRow(AdminThreadRowSchema, { ...thread, id: 5 })).toBeNull()
  })

  it('validates an admin message row', () => {
    const message = {
      id: 'am1', thread_id: 't1', sender_id: 'u1', content: 'hey', is_deleted: false,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      sender: { display_name: 'A' }
    }
    expect(parseRow(AdminMessageRowSchema, message)).toMatchObject({ id: 'am1' })
    expect(parseRow(AdminMessageRowSchema, { ...message, content: 9 })).toBeNull()
  })

  it('validates a profile row', () => {
    const profile = { id: 'u1', display_name: 'A', avatar_url: null, created_at: '2026-01-01T00:00:00Z', is_suspended: false }
    expect(parseRow(ProfileRowSchema, profile)).toMatchObject({ id: 'u1' })
    expect(parseRow(ProfileRowSchema, { ...profile, is_suspended: 'no' })).toBeNull()
  })
})

describe('RPC scalar schemas', () => {
  it('validates counts and booleans', () => {
    expect(parseRow(RpcCountSchema, 3)).toBe(3)
    expect(parseRow(RpcCountSchema, '3')).toBeNull()
    expect(parseRow(RpcBooleanSchema, true)).toBe(true)
    expect(parseRow(RpcBooleanSchema, null)).toBeNull()
  })
})
