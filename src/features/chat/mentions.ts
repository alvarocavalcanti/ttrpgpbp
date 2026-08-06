export interface MentionMember {
  user_id: string
  character_name: string
}

export interface ParsedMentions {
  content: string
  mentioned_user_ids: string[]
}

// Replaces `@CharacterName` references with `[@Name](user:uuid)` markdown links
// so mentions render as styled chips and can be routed for push notifications.
// Longest names are processed first so overlapping/multi-word names resolve correctly.
export function linkifyMentions(text: string, members: MentionMember[]): ParsedMentions {
  let content = text
  const mentioned_user_ids: string[] = []

  const sorted = [...members].sort((a, b) => b.character_name.length - a.character_name.length)

  for (const member of sorted) {
    if (!member.character_name) continue
    const escaped = member.character_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|\\s)@${escaped}(?=\\s|[.,;:!?)\\]]|$)`, 'g')
    const before = content
    content = content.replace(re, `$1[@${member.character_name}](user:${member.user_id})`)
    if (content !== before) mentioned_user_ids.push(member.user_id)
  }

  return { content, mentioned_user_ids }
}
