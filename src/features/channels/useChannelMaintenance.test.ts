import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelMaintenance } from './useChannelMaintenance'
import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../lib/supabasePagination'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../lib/supabasePagination', () => ({ fetchAllRows: vi.fn() }))

const chainedQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
}

describe('useChannelMaintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.from).mockReturnValue(chainedQuery as any)
    vi.mocked(fetchAllRows).mockResolvedValue([])
  })

  describe('fetchChannelMessages', () => {
    it('builds the export query for the channel and fetches every page', async () => {
      await useChannelMaintenance().fetchChannelMessages('chan-1')

      expect(supabase.from).toHaveBeenCalledWith('messages')
      expect(chainedQuery.select).toHaveBeenCalledWith('*, sender:profiles!messages_sender_id_fkey(display_name)')
      expect(chainedQuery.eq).toHaveBeenCalledWith('channel_id', 'chan-1')
      expect(chainedQuery.eq).toHaveBeenCalledWith('is_deleted', false)
      expect(chainedQuery.order).toHaveBeenCalledWith('created_at', { ascending: true })
      expect(chainedQuery.order).toHaveBeenCalledWith('id', { ascending: true })
      expect(fetchAllRows).toHaveBeenCalledWith(chainedQuery)
    })

    it('returns the fetched rows to the exporter', async () => {
      const rows = [{ content: 'hello', created_at: '2026-01-01T00:00:00Z' }]
      vi.mocked(fetchAllRows).mockResolvedValue(rows as any)

      await expect(useChannelMaintenance().fetchChannelMessages('chan-1')).resolves.toBe(rows)
    })
  })

  describe('archiveChannel', () => {
    it('flips is_archived on the channel row and returns null error on success', async () => {
      const update = vi.fn().mockReturnThis()
      const eq = vi.fn().mockResolvedValue({ error: null })
      vi.mocked(supabase.from).mockReturnValue({ update, eq } as any)

      await expect(useChannelMaintenance().archiveChannel('chan-1')).resolves.toBeNull()
      expect(supabase.from).toHaveBeenCalledWith('channels')
      expect(update).toHaveBeenCalledWith({ is_archived: true })
      expect(eq).toHaveBeenCalledWith('id', 'chan-1')
    })

    it('surfaces the update error so the caller keeps its toast flow', async () => {
      const archiveError = new Error('archive failed')
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: archiveError }),
      } as any)

      await expect(useChannelMaintenance().archiveChannel('chan-1')).resolves.toBe(archiveError)
    })
  })
})
