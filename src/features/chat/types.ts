import type { Database } from '../../types/database'

export interface ReplyMessage {
  id: string
  content: string
  sender_id: string | null
  is_deleted: boolean
  type: string
}

// Single source of truth for a chat message with joined data.
export type ChatMessage = Database['public']['Tables']['messages']['Row'] & {
  sender?: { display_name: string | null; avatar_url: string | null } | null
  whisper_target?: { display_name: string | null; avatar_url: string | null } | null
  reply?: ReplyMessage | null
}
