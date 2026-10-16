import { supabase } from '../../lib/supabase'

// Data layer for reporting a public listing (#674).
//
// Unlike a message report, the client sends nothing but the channel and the
// reason: report_channel_listing (SECURITY DEFINER) derives the reported party
// from the channel's GM, refuses a GM reporting their own listing, and allows
// only one open report per reporter per listing. The RPC raises on every
// refusal, so callers surface the message rather than a generic failure.
export function useReportChannelListing() {
  const reportChannelListing = async (channelId: string, reason: string) => {
    const { error } = await supabase.rpc('report_channel_listing', {
      p_channel_id: channelId,
      p_reason: reason,
    })
    return error
  }

  return { reportChannelListing }
}
