import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { ProfileRowSchema, parseRow } from '../validation/rowSchemas'

export type MessageRecipient = { id: string, display_name: string, avatar_url: string | null }

// Loads the DM recipients for the server admin's "New Message" picker: every
// non-suspended user (GMs and players alike — the admin can message anyone).
// Rows are validated with the shared profile schema instead of trusted
// blindly; a failed load surfaces as an error the modal renders with a Retry
// button.
export function useMessageRecipients(enabled: boolean) {
  const [recipients, setRecipients] = useState<MessageRecipient[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  const fetchRecipients = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_list_message_recipients')
      if (rpcError) {
        setError(new Error(rpcError.message))
      } else {
        const rows = (data ?? []).flatMap(row => {
          const parsed = parseRow(ProfileRowSchema, row)
          // The picker needs a label; skip rows without a display name.
          return parsed?.display_name
            ? [{ id: parsed.id, display_name: parsed.display_name, avatar_url: parsed.avatar_url ?? null }]
            : []
        })
        setRecipients(rows)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load recipients'))
    }
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    void fetchRecipients()
  }, [fetchRecipients])

  return { recipients, loading, error, refetch: fetchRecipients }
}
