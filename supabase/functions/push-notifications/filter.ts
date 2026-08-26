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

export type PushEventKind = 'message' | 'turn' | 'admin_message'

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
  // admin_message events (announcements / admin DMs)
  admin_type?: 'announcement' | 'dm'
  subject?: string
  admin_target_user_ids?: string[]
}

export interface PushTargetResult {
  targetUserIds: string[]
  title: string
  body: string
  url: string
}

export interface PushPayload {
  title: string
  body: string
  url: string
  unreadCount: number
  badgeEnabled: boolean
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

  if (event.kind === 'admin_message') {
    const targets = (event.admin_target_user_ids ?? []).filter(uid => uid !== event.sender_id)
    const title = event.admin_type === 'announcement' && event.subject
      ? `Announcement: ${event.subject}`
      : `New message from ${senderName}`
    return {
      targetUserIds: targets,
      title,
      body: truncate(event.content || ''),
      url: '/messages',
    }
  }

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

  if (event.whisper_to) {
    // Whisper body never carries content, even when the whisper is a scene or
    // dice roll — a whispered scene must not leak its text to the target's lock
    // screen (and routing stays exclusively on whisper_to below).
    title = `New whisper from ${displayName}`
    body = `New whisper from ${displayName} in ${channelName}`
  } else if (event.type === 'scene') {
    title = `New Scene in ${channelName}`
    body = truncate(event.content || '')
  } else if (event.type === 'dice_roll') {
    title = `${senderName} rolled dice`
    body = truncate(event.content || '')
  } else {
    title = `New message in ${channelName}`
    body = `${displayName}: ${truncate(event.content || '')}`
  }

  let targetUserIds: string[] = []
  if (event.whisper_to) {
    // Whisper always wins over mentions: never route whisper content to a
    // mentioned user or fall through to channel-wide routing.
    targetUserIds = [event.whisper_to]
  } else if (event.mention_user_ids?.length) {
    // Mentions route only to the mentioned users (excluding the sender).
    title = `${displayName} mentioned you`
    body = truncate(event.content || '')
    targetUserIds = event.mention_user_ids.filter(uid => uid !== event.sender_id)
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

// Shapes the per-user push payload sent to the service worker. Badge fields
// let the SW set the app icon badge count on platforms that support it (iOS,
// desktop). Pure: no IO.
export function buildPushPayload(
  target: { title: string; body: string; url: string },
  unreadCount: number,
  badgeEnabled: boolean
): PushPayload {
  return { ...target, unreadCount, badgeEnabled }
}

// Server-side mention parsing. The client persists mentions as markdown chips
// (`[@Hero](user:uuid)`, plus `[@all](user:all)` for the GM's @all), so push
// routing no longer depends on a client-supplied id list. Only chip links are
// matched, so prose containing a `(user:...)` fragment is ignored.
const MENTION_LINK_RE = /\[@[^\]]*\]\(user:([a-zA-Z0-9-]+)\)/g

export function extractMentionUserIds(content: string | null | undefined): string[] {
  if (!content) return []
  const ids = new Set<string>()
  for (const match of content.matchAll(MENTION_LINK_RE)) {
    ids.add(match[1])
  }
  return [...ids]
}

// Resolves extracted mention ids to a routing list: expands the `all` sentinel
// to every member and excludes the sender. Explicit ids are intersected with
// channel membership so a fabricated mention chip can't push to an outsider,
// matching the server-side mention resolution (blocked members excluded).
// Empty when there are no mentions.
export function resolveMentionTargets(
  mentionIds: string[],
  members: PushMember[],
  senderId: string
): string[] {
  if (mentionIds.length === 0) return []
  const memberIds = new Set(members.filter(m => !m.is_blocked).map(m => m.user_id))
  const ids = mentionIds.includes('all')
    ? members.map(m => m.user_id)
    : mentionIds
  return [...new Set(ids)].filter(uid => uid !== senderId && memberIds.has(uid))
}

// Deployed app origins. Override with the ALLOWED_ORIGINS secret (comma
// separated) for self-hosting.
export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://ttrpgpbp.pages.dev',
  'https://rolebypost.com',
]

// Origin allowlist used for CORS on the edge functions. Explicit origins are
// allowed verbatim; Cloudflare Pages preview deployments (<hash>.ttrpgpbp.pages.dev)
// are always allowed. If envList is provided and non-empty it replaces the
// default list (previews still pass). Pure: no IO, so it runs in vitest.
export function isAllowedOrigin(origin: string, envList?: string[]): boolean {
  const allowed = envList && envList.length > 0 ? envList : DEFAULT_ALLOWED_ORIGINS
  if (allowed.includes(origin)) return true
  return origin.endsWith('.ttrpgpbp.pages.dev')
}
