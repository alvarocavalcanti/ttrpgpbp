import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildUserDataExport, downloadJson } from './exportUserData'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const mockProfile = { display_name: 'Alv', avatar_url: null, created_at: '2026-01-01T00:00:00Z' }
const mockMemberships = [
  {
    channel_id: 'c1',
    channel: { name: 'The Den' },
    character_name: 'Frodo',
    character_avatar_url: null,
    character_sheet_url: null,
    is_away: false,
    is_blocked: false,
    joined_at: '2026-01-02T00:00:00Z',
  },
]
const mockMessages = [
  { id: 'm1', channel_id: 'c1', type: 'regular', content: 'hello', whisper_to: null, npc_name: null, is_edited: false, is_deleted: false, created_at: '2026-01-03T00:00:00Z' },
  { id: 'm2', channel_id: 'c1', type: 'regular', content: 'psst', whisper_to: 'other-user', npc_name: null, is_edited: false, is_deleted: false, created_at: '2026-01-04T00:00:00Z' },
]
const mockDice = [{ id: 'd1', channel_id: 'c1', notation: 'd20', result: 17, breakdown: {}, created_at: '2026-01-03T00:00:00Z' }]
const mockReactions = [{ id: 'r1', channel_id: 'c1', emoji: '🎲', created_at: '2026-01-03T00:00:00Z' }]
const mockPrefs = { push_enabled: true, badge_enabled: false, email_enabled: false }

function mockChain(data: unknown, error: Error | null = null) {
  const chain: any = {}
  chain.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  chain.then = (resolve: any, reject: any) => Promise.resolve({ data, error }).then(resolve, reject)
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  return chain
}

function setupQueries() {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    if (table === 'profiles') return mockChain(mockProfile)
    if (table === 'channel_members') return mockChain(mockMemberships)
    if (table === 'messages') return mockChain(mockMessages)
    if (table === 'dice_rolls') return mockChain(mockDice)
    if (table === 'message_reactions') return mockChain(mockReactions)
    if (table === 'notification_preferences') return mockChain(mockPrefs)
    return mockChain(null)
  }) as any)
}

describe('buildUserDataExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('assembles all user-scoped data and scopes queries by user id', async () => {
    setupQueries()
    const result = await buildUserDataExport('u1')

    expect(result.exported_at).toBe('2026-08-13T12:00:00.000Z')
    expect(result.profile).toEqual(mockProfile)
    expect(result.channel_memberships).toHaveLength(1)
    expect(result.channel_memberships[0].channel_name).toBe('The Den')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[1].whisper_to).toBe('other-user') // authored whisper included
    expect(result.dice_rolls).toEqual(mockDice)
    expect(result.reactions).toEqual(mockReactions)
    expect(result.notification_preferences).toEqual(mockPrefs)
  })

  it('queries every table with the user id filter', async () => {
    setupQueries()
    await buildUserDataExport('u1')

    const fromCalls = vi.mocked(supabase.from).mock.calls.map(c => c[0])
    expect(fromCalls).toEqual(['profiles', 'channel_members', 'messages', 'dice_rolls', 'message_reactions', 'notification_preferences'])
  })

  it('flattens a single-element channel relation to a name', async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'channel_members') return mockChain([{ ...mockMemberships[0], channel: [{ name: 'The Den' }] }])
      return mockChain(table === 'profiles' ? mockProfile : table === 'notification_preferences' ? mockPrefs : table === 'messages' ? mockMessages : table === 'dice_rolls' ? mockDice : mockReactions)
    }) as any)
    const result = await buildUserDataExport('u1')
    expect(result.channel_memberships[0].channel_name).toBe('The Den')
  })

  it('throws when a query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table === 'messages') return mockChain(null, new Error('db down'))
      return mockChain(table === 'profiles' ? mockProfile : null)
    }) as any)
    await expect(buildUserDataExport('u1')).rejects.toThrow('db down')
  })
})

describe('downloadJson', () => {
  it('triggers a blob download and revokes the object URL', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:url')
    const revokeObjectURL = vi.fn()
    const click = vi.fn()
    const remove = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('Blob', class {})
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({ href: '', download: '', click, remove }),
      body: { appendChild: vi.fn() },
    })

    downloadJson({ a: 1 }, 'export.json')

    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:url')
    vi.unstubAllGlobals()
  })
})
