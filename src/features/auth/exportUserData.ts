import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../lib/supabasePagination'

export interface ChannelMembership {
  channel_id: string
  channel_name: string | null
  character_name: string
  character_avatar_url: string | null
  character_sheet_url: string | null
  character_notes: string | null
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
  abuse_reports: {
    id: string
    reported_user_id: string | null
    reason: string
    status: string
    created_at: string
  }[]
  admin_messages: {
    id: string
    thread_id: string
    content: string
    created_at: string
  }[]
}

// Right of access / portability. Everything is scoped by RLS to rows the user
// owns; received whispers are not included (authored whispers are, via
// messages.sender_id). Channel names come from the nested channels relation,
// which RLS allows because the user is a member of their own channels. The
// reporter's own abuse reports are readable back since the reporter read-back
// policy; authored admin-thread messages are readable via admin_messages RLS.
export async function buildUserDataExport(userId: string): Promise<UserDataExport> {
  const profile = supabase
    .from('profiles')
    .select('display_name, avatar_url, created_at')
    .eq('id', userId)
    .maybeSingle()
  const membershipsQuery = supabase
    .from('channel_members')
    .select('channel_id, channel:channels(name), character_name, character_avatar_url, character_sheet_url, character_notes, is_away, is_blocked, joined_at')
    .eq('user_id', userId)
    .order('id', { ascending: true })
  const messagesQuery = supabase
    .from('messages')
    .select('id, channel_id, type, content, whisper_to, npc_name, is_edited, is_deleted, created_at')
    .eq('sender_id', userId)
    .order('id', { ascending: true })
  const diceRollsQuery = supabase
    .from('dice_rolls')
    .select('id, channel_id, notation, result, breakdown, created_at')
    .eq('roller_id', userId)
    .order('id', { ascending: true })
  const reactionsQuery = supabase
    .from('message_reactions')
    .select('id, channel_id, emoji, created_at')
    .eq('user_id', userId)
    .order('id', { ascending: true })
  const prefs = supabase
    .from('notification_preferences')
    .select('push_enabled, badge_enabled, email_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  const abuseReportsQuery = supabase
    .from('abuse_reports')
    .select('id, reported_user_id, reason, status, created_at')
    .eq('reporter_id', userId)
    .order('id', { ascending: true })
  const adminMessagesQuery = supabase
    .from('admin_messages')
    .select('id, thread_id, content, created_at')
    .eq('sender_id', userId)
    .order('id', { ascending: true })

  const [profileResult, memberships, messages, diceRolls, reactions, prefsResult, abuseReports, adminMessages] = await Promise.all([
    profile,
    fetchAllRows(membershipsQuery),
    fetchAllRows(messagesQuery),
    fetchAllRows(diceRollsQuery),
    fetchAllRows(reactionsQuery),
    prefs,
    fetchAllRows(abuseReportsQuery),
    fetchAllRows(adminMessagesQuery),
  ])

  for (const result of [profileResult, prefsResult]) {
    if (result.error) throw result.error
  }

  return {
    exported_at: new Date().toISOString(),
    profile: profileResult.data,
    channel_memberships: memberships.map(m => ({
      channel_id: m.channel_id,
      channel_name: Array.isArray(m.channel) ? m.channel[0]?.name ?? null : m.channel?.name ?? null,
      character_name: m.character_name,
      character_avatar_url: m.character_avatar_url,
      character_sheet_url: m.character_sheet_url,
      character_notes: m.character_notes,
      is_away: m.is_away,
      is_blocked: m.is_blocked,
      joined_at: m.joined_at,
    })),
    messages,
    dice_rolls: diceRolls,
    reactions,
    notification_preferences: prefsResult.data ?? null,
    abuse_reports: abuseReports.map(r => ({
      id: r.id,
      reported_user_id: r.reported_user_id,
      reason: r.reason,
      status: r.status,
      created_at: r.created_at,
    })),
    admin_messages: adminMessages,
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
