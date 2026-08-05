// Pure logic for routing push notifications to the right recipients.
// Kept dependency-free so it can run in the Deno edge function and in vitest.

export interface PushMember {
  user_id: string
  notify_all_messages?: boolean
  notify_gm_messages?: boolean
  notify_turn?: boolean
  is_active_player?: boolean
  is_blocked?: boolean
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
  whisper_to?: string | null
  whisper_target_name?: string | null
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

// Returns the member's effective boolean preference, defaulting to true.
function prefEnabled(member: PushMember, key: 'notify_all_messages' | 'notify_gm_messages' | 'notify_turn'): boolean {
  return member[key] !== false
}

// Builds recipient list + copy for a push event. Pure: no IO.
export function resolvePushTargets(event: PushEvent, members: PushMember[]): PushTargetResult {
  const channelName = event.channel_name || 'a channel'
  const senderName = event.sender_name || 'Someone'

  if (event.kind === 'turn') {
    if (!event.channel_id || !event.user_id) {
      return { targetUserIds: [], title: '', body: '', url: '' }
    }

    const target = members.find(m => m.user_id === event.user_id)
    const enabled = target ? prefEnabled(target, 'notify_turn') : true

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
    body = event.content || ''
  } else if (event.type === 'dice_roll') {
    title = `${senderName} rolled dice`
    body = event.content || ''
  } else if (event.whisper_to) {
    title = `New whisper from ${senderName}`
    body = event.content || ''
  } else {
    title = `New message in ${channelName}`
    body = `${senderName}: ${event.content || ''}`
  }

  let targetUserIds: string[] = []
  if (event.whisper_to) {
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
