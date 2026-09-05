import { supabase } from '../../lib/supabase'

// Data layer for the active-player picker (ARCH-1); ActivePlayerModal keeps
// the selection UX.
export function useActivePlayers() {
  const setActivePlayers = async (channelId: string, activePlayerIds: string[]) => {
    const { error } = await supabase.rpc('set_active_players', {
      p_channel_id: channelId,
      p_active_player_ids: activePlayerIds,
    })
    return error
  }

  return { setActivePlayers }
}
