import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomSheet } from '../../components/BottomSheet'
import { useToast } from '../../contexts/ToastContext'
import { trackEvent } from '../../lib/analytics'
import { channelTimestamp, gameSystemLabel } from './lobbyFormat'
import { usePublicChannelApply } from './usePublicChannelApply'

// Mirrors the server caps: request_to_join_channel truncates the name at 20 and
// rejects an answer over 1000 characters.
const MAX_CHARACTER_NAME_LENGTH = 20
const MAX_ANSWER_LENGTH = 1000

const FIELD_CLASS =
  'bg-white dark:bg-surface-800 mt-1 block w-full border-surface-300 dark:border-surface-600 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm px-3 py-2 border'

interface PublicChannelDetailSheetProps {
  channelId: string
  /** The card's game system, so listing_open does not wait for the fetch. */
  gameSystem: string | null
  onClose: () => void
}

/**
 * Discover listing detail (#674): the GM-authored copy, the activity line, and
 * the apply / pending / already-member states. Blocked callers get no row from
 * get_public_channel, so they only ever see the error state.
 */
export function PublicChannelDetailSheet({ channelId, gameSystem, onClose }: PublicChannelDetailSheetProps) {
  const { detail, loading, error, busy, refetch, apply, withdraw } = usePublicChannelApply(channelId)
  const { addToast } = useToast()
  const [characterName, setCharacterName] = useState('')
  const [answer, setAnswer] = useState('')

  // One listing_open per opened card. Depends on the id (not the fetched row) so
  // a refetch does not re-fire it.
  useEffect(() => {
    trackEvent('listing_open', { game_system: gameSystem ?? 'none' })
  }, [channelId, gameSystem])

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = characterName.trim()
    if (!name) return
    try {
      await apply(name, answer.trim())
      trackEvent('listing_apply_submit', { game_system: gameSystem ?? 'none' })
      addToast('Application sent')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not send your application.', 'error')
    }
  }

  const handleWithdraw = async () => {
    if (!detail?.pending_request_id) return
    try {
      await withdraw(detail.pending_request_id)
      addToast('Application withdrawn')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not withdraw your application.', 'error')
    }
  }

  const lastPlayed = channelTimestamp(detail?.last_message_at)
  const memberCount = detail?.member_count ?? 0

  return (
    <BottomSheet title={detail?.name ?? 'Game listing'} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center items-center h-32" role="status" aria-label="Loading listing">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-500"></div>
        </div>
      ) : error || !detail ? (
        <div
          role="alert"
          className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-center gap-3"
        >
          <span>Couldn't load this listing.</span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-surface-500 dark:text-surface-400">
            {gameSystemLabel(detail.game_system)} · {memberCount} {memberCount === 1 ? 'member' : 'members'}
            {lastPlayed ? ` · Last played ${lastPlayed}` : ''}
          </p>

          <div>
            <h4 className="text-sm font-medium text-surface-900 dark:text-surface-100">About this game</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300">{detail.description}</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-surface-900 dark:text-surface-100">What the GM expects</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300">{detail.constraints}</p>
          </div>

          <p className="text-xs text-surface-400 dark:text-surface-400">
            Run by {detail.gm_display_name ?? 'an unknown GM'}
          </p>

          {detail.is_member ? (
            <Link
              to={`/channel/${detail.id}`}
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Open channel
            </Link>
          ) : detail.pending_request_id ? (
            <div className="space-y-2">
              <p className="text-sm text-surface-600 dark:text-surface-300">
                Your application is waiting for the GM to review it.
              </p>
              <button
                type="button"
                onClick={() => void handleWithdraw()}
                disabled={busy}
                className="w-full inline-flex justify-center rounded-md border border-surface-300 dark:border-surface-600 shadow-sm px-4 py-2 bg-white dark:bg-surface-800 text-sm font-medium text-surface-700 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {busy ? 'Withdrawing...' : 'Withdraw application'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleApply} className="space-y-3">
              {detail.application_prompt && (
                <p className="text-sm text-surface-600 dark:text-surface-300">{detail.application_prompt}</p>
              )}
              <div>
                <label htmlFor="applyCharacterName" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  Character name
                </label>
                <input
                  id="applyCharacterName"
                  type="text"
                  required
                  maxLength={MAX_CHARACTER_NAME_LENGTH}
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label htmlFor="applyAnswer" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  Your answer
                </label>
                <textarea
                  id="applyAnswer"
                  rows={4}
                  maxLength={MAX_ANSWER_LENGTH}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <button
                type="submit"
                disabled={busy || !characterName.trim()}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {busy ? 'Sending...' : 'Apply to join'}
              </button>
            </form>
          )}
        </div>
      )}
    </BottomSheet>
  )
}
