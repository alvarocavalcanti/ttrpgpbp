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

// Downgrades persisted markdown to plain text for push bodies, which surface
// on the lock screen with no markdown renderer. Mention chips
// (`[@Hero](user:uuid)`), dice/check chips (`[1d20](dice:1d20)`), and plain
// links collapse to their labels; emphasis, headings, quotes, and rule markers
// are dropped; newlines collapse to one line. Paired markers only, so `2*3`
// and `snake_case` survive untouched. Pure: no IO, so it runs in vitest.
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^```[^\n]*\n([\s\S]*?)^```/gm, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
}

// Builds a lock-screen body from raw message content: strip markdown first so
// truncated text exposes real words, not chip syntax (#533). A body that is
// only markers (e.g. `***`) falls back to the raw trimmed text — the DB only
// guarantees non-blank content, and a blank tray line hides the message.
// Empty-label links/images (`[](url)`, `![](url)`) instead collapse to a safe
// empty body so their URLs never reach the lock screen. Non-global: `.test`
// on a /g regex is stateful (lastIndex), so this stays a one-shot check.
const HAS_LINK_OR_IMAGE_RE = /!?\[[^\]]*\]\([^)]*\)/

function plainBody(content: string | null | undefined): string {
  const raw = (content ?? '').trim()
  if (!raw) return ''
  const plain = toPlainText(raw)
  if (plain) return truncate(plain)
  return HAS_LINK_OR_IMAGE_RE.test(raw) ? '' : raw
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
      body: plainBody(event.content),
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
    body = plainBody(event.content)
  } else if (event.type === 'dice_roll') {
    title = `${senderName} rolled dice`
    body = plainBody(event.content)
  } else {
    title = `New message in ${channelName}`
    body = `${displayName}: ${plainBody(event.content)}`
  }

  let targetUserIds: string[] = []
  if (event.whisper_to) {
    // Whisper always wins over mentions: never route whisper content to a
    // mentioned user or fall through to channel-wide routing.
    targetUserIds = [event.whisper_to]
  } else if (event.mention_user_ids?.length) {
    // Mentions route only to the mentioned users (excluding the sender),
    // intersected with membership and deduped via resolveMentionTargets so a
    // blocked/non-member id can never receive content.
    title = `${displayName} mentioned you`
    body = plainBody(event.content)
    targetUserIds = resolveMentionTargets(event.mention_user_ids, members, event.sender_id ?? '')
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

// Merges per-user channel and admin unread rows into one badge number per
// user (#517): the launcher badge totals both. A user missing from either
// list counts 0 there. Pure: no IO.
export function mergeUnreadTotals(
  channelRows: { user_id: string; unread_count: number }[] | null | undefined,
  adminRows: { user_id: string; unread_count: number }[] | null | undefined
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of channelRows ?? []) {
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.unread_count)
  }
  for (const row of adminRows ?? []) {
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.unread_count)
  }
  return totals
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

// Announcement push recipients by audience (#466):
//  - 'all_users' → every non-suspended user
//  - 'gms' → the distinct GMs of non-archived channels, minus suspended GMs
//    (is_active_gm parity — suspended GMs can no longer read those channels,
//    and their badge counts would drift)
// The sender exclusion happens later in resolvePushTargets, so the GM sending
// an announcement does not receive it. Pure: no IO, so it runs in vitest.
export function resolveAnnouncementTargets(
  audience: 'all_users' | 'gms' | null,
  profiles: Array<{ id: string; is_suspended: boolean }>,
  gmIds: string[],
): string[] {
  const suspended = new Set(profiles.filter(p => p.is_suspended).map(p => p.id))
  if (audience === 'all_users') {
    return profiles.filter(p => !p.is_suspended).map(p => p.id)
  }
  if (audience !== 'gms') {
    // Unknown/null audience (cannot happen for persisted announcements — the
    // type check requires an audience) pushes to nobody.
    return []
  }
  return [...new Set(gmIds.filter(id => !suspended.has(id)))]
}
