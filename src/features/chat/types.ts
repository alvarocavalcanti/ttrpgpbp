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
  client_request_id?: string | null
  pending?: boolean
  error?: string | null
  pending_payload?: PendingPayload
}

export interface MessageSendPayload {
  content: string
  type: 'regular' | 'scene' | 'npc'
  whisper_to?: string
  active_player_ids?: string[]
  reply_to?: string
  npc_name?: string
  npc_avatar_url?: string
}

// A channel member with optional per-ability modifiers (keyed by e.g. STR).
export interface Member {
  user_id: string
  character_name: string
  attributes?: Record<string, number>
}

// Optimistic payload stashed on a pending message so a retry can replay the
// original send without re-deriving it from the optimistic row.
export type PendingPayload =
  | ({ kind: 'message' } & MessageSendPayload)
  | { kind: 'roll'; notation: string; replyToId?: string; warning?: string; dc?: number | null }
