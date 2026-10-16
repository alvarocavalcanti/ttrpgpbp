import { Link } from 'react-router-dom'
import type { JoinRequestDecision } from './useMyJoinRequestDecisions'

interface JoinRequestNoticeProps {
  decisions: JoinRequestDecision[]
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
export function JoinRequestNotice({ decisions, onDismiss }: JoinRequestNoticeProps) {
  if (decisions.length === 0) return null

  return (
    <div className="flex flex-col gap-2" data-testid="join-request-notice">
      {decisions.map((decision) => {
        const approved = decision.status === 'approved'
        return (
          <div
            key={decision.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-surface-200 bg-white px-3 py-2 dark:border-surface-700 dark:bg-surface-800"
          >
            {/* The live region is the message only: the buttons stay outside it,
                so a screen reader announces the decision, not "Dismiss, button". */}
            <p role="status" className="min-w-0 flex-1 text-sm text-surface-700 dark:text-surface-300">
              {approved ? (
                <>
                  <span className="font-medium text-surface-900 dark:text-surface-100">You&apos;re in</span>
                  {' — '}
                  <span className="break-words">{decision.channel_name}</span>
                </>
              ) : (
                <>
                  Your application to <span className="break-words">{decision.channel_name}</span> was declined.
                </>
              )}
            </p>

            <div className="flex flex-shrink-0 items-center gap-2">
              {approved && (
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
                aria-label={approved ? `Dismiss the good news about ${decision.channel_name}` : `Dismiss the decision for ${decision.channel_name}`}
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
