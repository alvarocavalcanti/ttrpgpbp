// Pure logic for routing push notifications to the right recipients.
// Kept dependency-free so it can run in the Deno edge function and in vitest.

export interface PushMember {
  user_id: string
  notify_all_messages?: boolean
  notify_gm_messages?: boolean
  notify_turn?: boolean
  is_active_player?: boolean
  is_blocked?: boolean
  is_away?: boolean
}

export type PushEventKind = 'message' | 'turn'

export interface PushEvent {
  kind: PushEventKind
  // message events
  channel_id?: string
  channel_name?: string
  sender_id?: string
  sender_name?: string
  content?: string
  type?: string
  npc_name?: string
  whisper_to?: string | null
  whisper_target_name?: string | null
  mention_user_ids?: string[]
  gm_id?: string
  // turn events
  user_id?: string
}

export interface PushTargetResult {
  targetUserIds: string[]
  title: string
  body: string
  url: string
}

const CHANNEL_URL = (channelId: string) => `/channel/${channelId}`

// Push bodies surface on the lock screen, so keep content short and never
// include whisper text.
const MAX_BODY_LENGTH = 100

function truncate(text: string): string {
  return text.length > MAX_BODY_LENGTH ? `${text.slice(0, MAX_BODY_LENGTH)}…` : text
}

// Returns the member's effective boolean preference, defaulting to true.
function prefEnabled(member: PushMember, key: 'notify_all_messages' | 'notify_gm_messages' | 'notify_turn'): boolean {
  return member[key] !== false
}

// Builds recipient list + copy for a push event. Pure: no IO.
export function resolvePushTargets(event: PushEvent, members: PushMember[]): PushTargetResult {
  const channelName = event.channel_name || 'a channel'
  const senderName = event.sender_name || 'Someone'
  // NPC messages attribute the push to the NPC, not the GM sending it.
  const displayName = event.npc_name || senderName

  if (event.kind === 'turn') {
    if (!event.channel_id || !event.user_id) {
      return { targetUserIds: [], title: '', body: '', url: '' }
    }

      const target = members.find(m => m.user_id === event.user_id)
      const enabled = target ? prefEnabled(target, 'notify_turn') && !target.is_away : true

    return {
      targetUserIds: enabled ? [event.user_id] : [],
      title: "It's your turn!",
      body: `It is now your turn in ${channelName}.`,
      url: CHANNEL_URL(event.channel_id)
    }
  }

  // message event
  if (!event.channel_id || !event.sender_id) {
    return { targetUserIds: [], title: '', body: '', url: '' }
  }

  let title: string
  let body: string

  if (event.type === 'scene') {
    title = `New Scene in ${channelName}`
    body = truncate(event.content || '')
  } else if (event.type === 'dice_roll') {
    title = `${senderName} rolled dice`
    body = truncate(event.content || '')
  } else if (event.whisper_to) {
    title = `New whisper from ${displayName}`
    body = `New whisper from ${displayName} in ${channelName}`
  } else {
    title = `New message in ${channelName}`
    body = `${displayName}: ${truncate(event.content || '')}`
  }

  let targetUserIds: string[] = []
  if (event.mention_user_ids?.length) {
    // Mentions route only to the mentioned users (excluding the sender).
    title = `${displayName} mentioned you`
    body = truncate(event.content || '')
    targetUserIds = event.mention_user_ids.filter(uid => uid !== event.sender_id)
  } else if (event.whisper_to) {
    targetUserIds = [event.whisper_to]
  } else {
    const isGM = event.sender_id === event.gm_id
    targetUserIds = members
      .filter(m => m.user_id !== event.sender_id)
      .filter(m => !m.is_blocked)
      .filter(m => isGM
        ? prefEnabled(m, 'notify_gm_messages')
        : prefEnabled(m, 'notify_all_messages'))
      .map(m => m.user_id)
  }

  return {
    targetUserIds,
    title,
    body,
    url: CHANNEL_URL(event.channel_id)
  }
}
