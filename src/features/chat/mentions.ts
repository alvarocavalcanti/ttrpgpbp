export interface MentionMember {
  user_id: string
  character_name: string
}

export interface ParsedMentions {
  content: string
  mentioned_user_ids: string[]
}

// `@all` (GM-only) links to every member and routes push to all of them. The
// chip uses a reserved `user:all` id; the sender is excluded at push time.
const ALL_MENTION_RE = /(^|\s)@all(?=\s|[.,;:!?)\]]|$)/g

// Replaces `@CharacterName` references with `[@Name](user:uuid)` markdown links
// so mentions render as styled chips and can be routed for push notifications.
// Longest names are processed first so overlapping/multi-word names resolve correctly.
// Duplicate character names collapse to the first member (ambiguous mentions).
export function linkifyMentions(text: string, members: MentionMember[], opts?: { allMentionEnabled?: boolean }): ParsedMentions {
  let content = text
  const mentioned_user_ids: string[] = []

  if (opts?.allMentionEnabled) {
    const beforeAll = content
    content = content.replace(ALL_MENTION_RE, '$1[@all](user:all)')
    if (content !== beforeAll) {
      for (const m of members) {
        if (m.user_id) mentioned_user_ids.push(m.user_id)
      }
    }
  }

  const seen = new Set<string>()
  const uniqueMembers = [...members]
    .sort((a, b) => b.character_name.length - a.character_name.length)
    .filter(m => {
      if (!m.character_name || seen.has(m.character_name)) return false
      seen.add(m.character_name)
      return true
    })

  for (const member of uniqueMembers) {
    const escaped = member.character_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|\\s)@${escaped}(?=\\s|[.,;:!?)\\]]|$)`, 'g')
    const before = content
    content = content.replace(re, `$1[@${member.character_name}](user:${member.user_id})`)
    if (content !== before) mentioned_user_ids.push(member.user_id)
  }

  // @all already lists every member, so an explicit `@Hero` on top of it would
  // duplicate the id. Preserve insertion order while collapsing repeats.
  return { content, mentioned_user_ids: [...new Set(mentioned_user_ids)] }
}
