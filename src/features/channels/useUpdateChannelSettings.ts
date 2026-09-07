import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

type UpdateChannelSettingsArgs = Database['public']['Functions']['update_channel_settings']['Args']

// Data layer for channel settings updates (ARCH-1): the update_channel_settings
// RPC lives here; ChannelSettings keeps the form UX and error copy.
export function useUpdateChannelSettings() {
  const updateChannelSettings = async (params: UpdateChannelSettingsArgs) => {
    // update_channel_settings persists channels + channel_secrets + safety
    // tools in one transaction, so a partial failure can never leave a
    // half-saved channel.
    return supabase.rpc('update_channel_settings', params)
  }

  return { updateChannelSettings }
}
