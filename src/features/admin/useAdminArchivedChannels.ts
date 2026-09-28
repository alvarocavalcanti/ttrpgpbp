import { useEffect, useState, useCallback } from 'react'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'

// A row from admin_list_archived_channels (issue #611). The GM and email
// joins are LEFT (the membership and profile rows survive deletion, the
// channel itself can be orphaned), so those fields can be null despite the
// generated RPC type marking them non-null — same caveat as the
// AdminChannelMember rows in useAdminChannelMessages.
export const AdminArchivedChannelRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  game_system: z.string(),
  gm_id: z.string().nullable(),
  gm_display_name: z.string().nullable(),
  gm_email: z.string().nullable(),
  member_count: z.number(),
  player_characters: z.array(z.string()),
  created_at: z.string(),
  last_message_at: z.string().nullable(),
})

export type AdminArchivedChannel = z.infer<typeof AdminArchivedChannelRowSchema>

// Archived-channel list for the server admin console (issue #611): every
// archived channel with its GM name/email and player-character roster, for
// the restore-request support workflow. Display-only; restore stays GM-only.
//
// Own fetch state on purpose: a broken or late-deployed RPC must degrade
// only this tab, never the whole admin console (see useAdminData's all-RPCs
// Promise.all, which blanks everything on any single failure).
export function useAdminArchivedChannels(isServerAdmin: boolean) {
  const [archivedChannels, setArchivedChannels] = useState<AdminArchivedChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchArchived = useCallback(async () => {
    if (!isServerAdmin) {
      setArchivedChannels([])
      setError(null)
      setLoading(false)
      return
    }
    // New fetch: stale rows/errors must not outlive the rows replacing them.
    setArchivedChannels([])
    setError(null)
    setLoading(true)
    try {
      const { data, error: queryError } = await supabase.rpc('admin_list_archived_channels')
      if (queryError) throw queryError
      if (!Array.isArray(data)) throw new Error('Malformed archived channels payload.')
      // RPC payloads aren't runtime-validated; a malformed row would crash
      // AdminView's sort during render, so drop it instead of trusting it.
      setArchivedChannels(
        data
          .map(row => AdminArchivedChannelRowSchema.safeParse(row))
          .filter(r => r.success)
          .map(r => r.data),
      )
    } catch (err) {
      console.error('Error fetching archived channels:', err)
      setError('Failed to load archived channels.')
    } finally {
      setLoading(false)
    }
  }, [isServerAdmin])

  useEffect(() => {
    void fetchArchived()
  }, [fetchArchived])

  const refetch = useCallback(() => {
    void fetchArchived()
  }, [fetchArchived])

  return { archivedChannels, loading, error, refetch }
}
