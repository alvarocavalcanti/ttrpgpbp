import type { Database } from '../../types/database'

export type Thread = Database['public']['Tables']['admin_threads']['Row'] & {
  creator: { display_name: string | null, avatar_url: string | null }
  gm?: { display_name: string | null, avatar_url: string | null }
  unread?: boolean
}

export type Message = Database['public']['Tables']['admin_messages']['Row'] & {
  // Null for system messages (no human sender) and whenever the sender's
  // profile join misses; every reader must handle it.
  sender: { display_name: string | null, avatar_url: string | null } | null
}
