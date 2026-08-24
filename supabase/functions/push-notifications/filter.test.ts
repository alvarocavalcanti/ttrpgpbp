import { describe, it, expect } from 'vitest'
import {resolvePushTargets, buildPushPayload, extractMentionUserIds, resolveMentionTargets, isAllowedOrigin} from './filter.ts'

const MEMBERS = [
  { user_id: 'u1', notify_all_messages: true, notify_gm_messages: true, notify_turn: true },
  { user_id: 'u2', notify_all_messages: true, notify_gm_messages: true, notify_turn: true },
  { user_id: 'u3', notify_all_messages: false, notify_gm_messages: true, notify_turn: true },
  { user_id: 'u4', notify_all_messages: true, notify_gm_messages: false, notify_turn: false }
]

describe('resolvePushTargets', () => {
  describe('message events', () => {
    it('routes regular message to members with notify_all_messages, excluding sender', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u1',
        sender_name: 'Alv',
        content: 'hello',
        type: 'regular',
        gm_id: 'u9'
      }, MEMBERS)

      // u2 has all_messages true, u3 has all_messages false, u4 has all_messages true
      expect(result.targetUserIds).toEqual(['u2', 'u4'])
      expect(result.title).toBe('New message in The Den')
      expect(result.body).toBe('Alv: hello')
      expect(result.url).toBe('/channel/c1')
    })

    it('routes GM messages to members with notify_gm_messages only', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        sender_id: 'u1',
        sender_name: 'GM',
        content: 'roll initiative',
        type: 'regular',
        gm_id: 'u1'
      }, MEMBERS)

      // u1 is sender (excluded), u3 has gm_messages true, u2 has gm true, u4 gm false
      expect(result.targetUserIds).toEqual(['u2', 'u3'])
    })

    it('routes scene message copy', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u1',
        sender_name: 'GM',
        content: 'a dark alley',
        type: 'scene',
        gm_id: 'u1'
      }, MEMBERS)

      expect(result.title).toBe('New Scene in The Den')
      expect(result.body).toBe('a dark alley')
    })

    it('truncates long bodies for the lock screen', () => {
      const longContent = 'x'.repeat(150)
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u2',
        sender_name: 'Bobo',
        content: longContent,
        type: 'regular',
        gm_id: 'u1'
      }, MEMBERS)

      expect(result.body).toBe(`Bobo: ${'x'.repeat(100)}…`)
    })

    it('attributes NPC messages to the NPC name, not the GM', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u1',
        sender_name: 'GM',
        content: 'Trespassers!',
        type: 'npc',
        npc_name: 'Goblin King',
        gm_id: 'u1'
      }, MEMBERS)

      expect(result.title).toBe('New message in The Den')
      expect(result.body).toBe('Goblin King: Trespassers!')
    })

    it('routes NPC whispers to the whisper target only', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u1',
        sender_name: 'GM',
        content: 'psst',
        type: 'npc',
        npc_name: 'Goblin King',
        whisper_to: 'u4',
        gm_id: 'u1'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['u4'])
      expect(result.title).toBe('New whisper from Goblin King')
      expect(result.body).toBe('New whisper from Goblin King in The Den')
    })

    it('routes dice roll copy', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u2',
        sender_name: 'Bobo',
        content: 'Rolled 1d20: **15**',
        type: 'dice_roll',
        gm_id: 'u1'
      }, MEMBERS)

      expect(result.title).toBe('Bobo rolled dice')
      expect(result.body).toBe('Rolled 1d20: **15**')
    })

    it('routes whisper only to whisper target', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u1',
        sender_name: 'GM',
        content: 'psst',
        type: 'regular',
        whisper_to: 'u4',
        gm_id: 'u1'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['u4'])
      expect(result.title).toBe('New whisper from GM')
      expect(result.body).toBe('New whisper from GM in The Den')
    })

    it('routes mentions only to mentioned users, excluding sender', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u1',
        sender_name: 'Alv',
        content: 'Hey [@Hero](user:u2) and [@Me](user:u1)',
        type: 'regular',
        mention_user_ids: ['u1', 'u2', 'u3'],
        gm_id: 'u9'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['u2', 'u3'])
      expect(result.title).toBe('Alv mentioned you')
      expect(result.body).toContain('[@Hero]')
    })

    it('falls back to normal routing when mention list is empty', () => {
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        channel_name: 'The Den',
        sender_id: 'u1',
        sender_name: 'Alv',
        content: 'hello',
        type: 'regular',
        mention_user_ids: [],
        gm_id: 'u9'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['u2', 'u4'])
      expect(result.title).toBe('New message in The Den')
    })

    it('excludes blocked members', () => {
      const members = [
        { user_id: 'u1', notify_all_messages: true },
        { user_id: 'u2', notify_all_messages: true, is_blocked: true }
      ]
      const result = resolvePushTargets({
        kind: 'message',
        channel_id: 'c1',
        sender_id: 'u1',
        content: 'hi',
        type: 'regular',
        gm_id: 'u1'
      }, members)

      expect(result.targetUserIds).toEqual([])
    })

    it('returns empty when message event is missing ids', () => {
      const result = resolvePushTargets({
        kind: 'message',
        content: 'no ids',
        type: 'regular'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual([])
    })
  })

  describe('turn events', () => {
    it('notifies active player with notify_turn enabled', () => {
      const result = resolvePushTargets({
        kind: 'turn',
        channel_id: 'c1',
        channel_name: 'The Den',
        user_id: 'u2'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['u2'])
      expect(result.title).toBe("It's your turn!")
      expect(result.url).toBe('/channel/c1')
    })

    it('suppresses turn notification when notify_turn disabled', () => {
      const result = resolvePushTargets({
        kind: 'turn',
        channel_id: 'c1',
        user_id: 'u4'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual([])
    })

    it('suppresses turn notification when the player is away (AFK)', () => {
      const members = [
        { user_id: 'u1', notify_turn: true, is_away: true },
        { user_id: 'u2', notify_turn: true, is_away: false }
      ]
      const away = resolvePushTargets({
        kind: 'turn',
        channel_id: 'c1',
        channel_name: 'The Den',
        user_id: 'u1'
      }, members)

      expect(away.targetUserIds).toEqual([])

      const present = resolvePushTargets({
        kind: 'turn',
        channel_id: 'c1',
        user_id: 'u2'
      }, members)

      expect(present.targetUserIds).toEqual(['u2'])
    })

    it('still notifies away player with no is_away flag set (default present)', () => {
      const result = resolvePushTargets({
        kind: 'turn',
        channel_id: 'c1',
        user_id: 'u2'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['u2'])
    })

    it('defaults to enabled when member not found', () => {
      const result = resolvePushTargets({
        kind: 'turn',
        channel_id: 'c1',
        user_id: 'unknown'
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['unknown'])
    })

    it('returns empty when turn event is missing ids', () => {
      const result = resolvePushTargets({ kind: 'turn' }, MEMBERS)
      expect(result.targetUserIds).toEqual([])
    })
  })

  describe('admin_message events', () => {
    it('routes announcements to targets, excluding the sender', () => {
      const result = resolvePushTargets({
        kind: 'admin_message',
        admin_type: 'announcement',
        subject: 'Server maintenance',
        content: 'Downtime tonight.',
        sender_id: 'u1',
        sender_name: 'Alv',
        admin_target_user_ids: ['u1', 'u2', 'u3']
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['u2', 'u3'])
      expect(result.title).toBe('Announcement: Server maintenance')
      expect(result.body).toBe('Downtime tonight.')
      expect(result.url).toBe('/messages')
    })

    it('routes admin DMs to the non-sender participant', () => {
      const result = resolvePushTargets({
        kind: 'admin_message',
        admin_type: 'dm',
        content: 'Hey GM.',
        sender_id: 'u1',
        sender_name: 'Alv',
        admin_target_user_ids: ['u2']
      }, MEMBERS)

      expect(result.targetUserIds).toEqual(['u2'])
      expect(result.title).toBe('New message from Alv')
      expect(result.body).toBe('Hey GM.')
      expect(result.url).toBe('/messages')
    })

    it('truncates long admin message bodies', () => {
      const longContent = 'y'.repeat(150)
      const result = resolvePushTargets({
        kind: 'admin_message',
        admin_type: 'dm',
        content: longContent,
        sender_id: 'u1',
        sender_name: 'Alv',
        admin_target_user_ids: ['u2']
      }, MEMBERS)

      expect(result.body).toBe(`${'y'.repeat(100)}…`)
    })

    it('returns empty when only the sender is targeted', () => {
      const result = resolvePushTargets({
        kind: 'admin_message',
        admin_type: 'announcement',
        subject: 'Hi',
        content: 'Hello',
        sender_id: 'u1',
        sender_name: 'Alv',
        admin_target_user_ids: ['u1']
      }, MEMBERS)

      expect(result.targetUserIds).toEqual([])
    })

    it('returns empty when there are no targets', () => {
      const result = resolvePushTargets({
        kind: 'admin_message',
        admin_type: 'dm',
        content: 'Hello',
        sender_id: 'u1',
        sender_name: 'Alv',
        admin_target_user_ids: []
      }, MEMBERS)

      expect(result.targetUserIds).toEqual([])
      expect(result.title).toBe('New message from Alv')
    })
  })
})

describe('buildPushPayload', () => {
  const target = { title: 'New message in The Den', body: 'Alv: hello', url: '/channel/c1' }

  it('includes unread count and badge enabled', () => {
    expect(buildPushPayload(target, 5, true)).toEqual({ ...target, unreadCount: 5, badgeEnabled: true })
  })

  it('carries badge disabled flag', () => {
    expect(buildPushPayload(target, 5, false)).toEqual({ ...target, unreadCount: 5, badgeEnabled: false })
  })

  it('carries zero unread count', () => {
    expect(buildPushPayload(target, 0, true).unreadCount).toBe(0)
  })
})

describe('extractMentionUserIds', () => {
  it('extracts ids from linkified mention chips', () => {
    const content = 'Hey [@Hero](user:u2) and [@Me](user:u1), roll initiative!'
    expect(extractMentionUserIds(content)).toEqual(['u2', 'u1'])
  })

  it('extracts the @all sentinel', () => {
    expect(extractMentionUserIds('[@all](user:all) lets go')).toEqual(['all'])
  })

  it('dedupes repeated mentions of the same user', () => {
    const content = '[@Hero](user:u2) again [@Hero](user:u2)'
    expect(extractMentionUserIds(content)).toEqual(['u2'])
  })

  it('ignores prose containing user: fragments outside a chip', () => {
    expect(extractMentionUserIds('a (user:u2) fragment')).toEqual([])
  })

  it('returns empty for null, empty, and mention-free content', () => {
    expect(extractMentionUserIds(null)).toEqual([])
    expect(extractMentionUserIds(undefined)).toEqual([])
    expect(extractMentionUserIds('no mentions here')).toEqual([])
  })
})

describe('resolveMentionTargets', () => {
  it('returns empty when there are no mentions', () => {
    expect(resolveMentionTargets([], MEMBERS, 'u1')).toEqual([])
  })

  it('filters the sender out of the routing list', () => {
    expect(resolveMentionTargets(['u1', 'u2', 'u3'], MEMBERS, 'u1')).toEqual(['u2', 'u3'])
  })

  it('expands the all sentinel to every member and excludes the sender', () => {
    expect(resolveMentionTargets(['all'], MEMBERS, 'u1')).toEqual(['u2', 'u3', 'u4'])
  })

  it('expands all even when combined with explicit mentions', () => {
    expect(resolveMentionTargets(['all', 'u2'], MEMBERS, 'u1')).toEqual(['u2', 'u3', 'u4'])
  })

  it('dedupes repeated ids', () => {
    expect(resolveMentionTargets(['u2', 'u2', 'u3'], MEMBERS, 'u1')).toEqual(['u2', 'u3'])
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
