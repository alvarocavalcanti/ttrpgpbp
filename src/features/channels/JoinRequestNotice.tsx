import { Link } from 'react-router-dom'
import type { JoinRequestDecision } from './useMyJoinRequestDecisions'

interface JoinRequestNoticeProps {
  decisions: JoinRequestDecision[]
  /** Set when the decisions could not be loaded at all. */
  error?: Error | null
  onRetry?: () => void
  onDismiss: (id: string) => void
}

/**
 * The applicant's decided applications, shown at the top of the Lobby (#722).
 *
 * A decision used to be push-only, so a player without notifications saw a
 * rejection as "nothing happened" and an approval as a silent new row. Each
 * notice clears itself: approving opens the channel, and either outcome can be
 * dismissed permanently.
 */
export function JoinRequestNotice({ decisions, error, onRetry, onDismiss }: JoinRequestNoticeProps) {
  if (decisions.length === 0) {
    // A failed fetch is not "no decisions": say so and offer a retry rather than
    // hiding a decision the player would never learn about.
    if (!error) return null
    return (
      <div
        role="alert"
        data-testid="join-request-notice-error"
        className="flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
      >
        <span className="min-w-0 flex-1">Could not check your applications.</span>        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center px-3 font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-testid="join-request-notice">
      {decisions.map((decision) => {
        // An approval is history: access can be gone since (removed, blocked,
        // left), so the link only appears while it is still real.
        const canOpen = decision.status === 'approved' && decision.is_member === true
        const approvedWithoutAccess = decision.status === 'approved' && !canOpen
        return (
          <div
            key={decision.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-surface-200 bg-white px-3 py-2 dark:border-surface-700 dark:bg-surface-800"
          >
            {/* The live region is the message only: the buttons stay outside it,
                so a screen reader announces the decision, not "Dismiss, button". */}
            <p role="status" className="min-w-0 flex-1 text-sm text-surface-700 dark:text-surface-300">
              {canOpen ? (
                <>
                  <span className="font-medium text-surface-900 dark:text-surface-100">You&apos;re in</span>
                  {' — '}
                  <span className="break-words">{decision.channel_name}</span>
                </>
              ) : approvedWithoutAccess ? (
                <>
                  You were accepted to <span className="break-words">{decision.channel_name}</span>, and you are not
                  in it now.
                </>
              ) : (
                <>
                  Your application to <span className="break-words">{decision.channel_name}</span> was declined.
                </>
              )}
            </p>

            <div className="flex flex-shrink-0 items-center gap-2">
              {canOpen && (
                <Link
                  to={`/channel/${decision.channel_id}`}
                  onClick={() => onDismiss(decision.id)}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-transparent bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  Open channel
                </Link>
              )}
              <button
                type="button"
                onClick={() => onDismiss(decision.id)}
                aria-label={canOpen ? `Dismiss the good news about ${decision.channel_name}` : `Dismiss the decision for ${decision.channel_name}`}
                className="inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-medium text-surface-500 hover:text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:text-surface-400 dark:hover:text-surface-200"
              >
                Dismiss
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
