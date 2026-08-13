import { supabase } from '../../lib/supabase'

export interface ChannelMembership {
  channel_id: string
  channel_name: string | null
  character_name: string
  character_avatar_url: string | null
  character_sheet_url: string | null
  is_away: boolean
  is_blocked: boolean
  joined_at: string
}

export interface UserDataExport {
  exported_at: string
  profile: {
    display_name: string | null
    avatar_url: string | null
    created_at: string
  } | null
  channel_memberships: ChannelMembership[]
  messages: {
    id: string
    channel_id: string
    type: string
    content: string
    whisper_to: string | null
    npc_name: string | null
    is_edited: boolean
    is_deleted: boolean
    created_at: string
  }[]
  dice_rolls: {
    id: string
    channel_id: string
    notation: string
    result: number
    breakdown: unknown
    created_at: string
  }[]
  reactions: {
    id: string
    channel_id: string
    emoji: string
    created_at: string
  }[]
  notification_preferences: {
    push_enabled: boolean
    badge_enabled: boolean
    email_enabled: boolean
  } | null
}

// Right of access / portability. Everything is scoped by RLS to rows the user
// owns; received whispers are not included (authored whispers are, via
// messages.sender_id). Channel names come from the nested channels relation,
// which RLS allows because the user is a member of their own channels.
export async function buildUserDataExport(userId: string): Promise<UserDataExport> {
  const [
    profile,
    memberships,
    messages,
    diceRolls,
    reactions,
    prefs,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, avatar_url, created_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('channel_members')
      .select('channel_id, channel:channels(name), character_name, character_avatar_url, character_sheet_url, is_away, is_blocked, joined_at')
      .eq('user_id', userId),
    supabase
      .from('messages')
      .select('id, channel_id, type, content, whisper_to, npc_name, is_edited, is_deleted, created_at')
      .eq('sender_id', userId),
    supabase
      .from('dice_rolls')
      .select('id, channel_id, notation, result, breakdown, created_at')
      .eq('roller_id', userId),
    supabase
      .from('message_reactions')
      .select('id, channel_id, emoji, created_at')
      .eq('user_id', userId),
    supabase
      .from('notification_preferences')
      .select('push_enabled, badge_enabled, email_enabled')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  for (const result of [profile, memberships, messages, diceRolls, reactions, prefs]) {
    if (result.error) throw result.error
  }

  return {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    channel_memberships: (memberships.data ?? []).map(m => ({
      channel_id: m.channel_id,
      channel_name: Array.isArray(m.channel) ? m.channel[0]?.name ?? null : m.channel?.name ?? null,
      character_name: m.character_name,
      character_avatar_url: m.character_avatar_url,
      character_sheet_url: m.character_sheet_url,
      is_away: m.is_away,
      is_blocked: m.is_blocked,
      joined_at: m.joined_at,
    })),
    messages: messages.data ?? [],
    dice_rolls: diceRolls.data ?? [],
    reactions: reactions.data ?? [],
    notification_preferences: prefs.data ?? null,
  }
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
