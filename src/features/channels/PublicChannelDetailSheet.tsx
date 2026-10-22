import { PublicListingDetail } from './PublicListingDetail'

interface PublicChannelDetailSheetProps {
  channelId: string
  /** The card's game system, so listing_open does not wait for the fetch. */
  gameSystem: string | null
  onClose: () => void
}

/**
 * Discover listing detail (#674) as a bottom sheet. The body lives in
 * PublicListingDetail so the shareable /game/:id page (#755) renders the same
 * states.
 */
export function PublicChannelDetailSheet({ channelId, gameSystem, onClose }: PublicChannelDetailSheetProps) {
  return <PublicListingDetail channelId={channelId} gameSystem={gameSystem} onClose={onClose} />
}
