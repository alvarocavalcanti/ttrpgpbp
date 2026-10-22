import { Link, useNavigate, useParams } from 'react-router-dom'
import { LinkifiedText } from '../../components/LinkifiedText'
import { Seo } from '../../components/Seo'
import { ROUTES } from '../../lib/publicRoutes'
import { useAuth } from '../auth/useAuth'
import { gameSystemLabel } from '../channels/lobbyFormat'
import { PublicListingDetail } from '../channels/PublicListingDetail'
import { MarketingHeader } from '../marketing/MarketingHeader'
import { SiteFooter } from '../marketing/SiteFooter'
import { usePublicChannelAnonDetail } from './usePublicChannelAnonDetail'

/**
 * Shareable public game page (#755): the URL a GM posts outside the app.
 *
 * Signed-out visitors read the GM-authored listing copy from the anonymous
 * projection and are pointed at sign-in; signed-in visitors get the same
 * apply/pending/member states as the Discover sheet, so the link lands
 * somewhere useful at any auth state. Not indexable — /directory stays the
 * public, prerendered surface (the route is in APP_ROUTE_KEYS).
 */
export function GameDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const channelId = id ?? ''
  const { detail, loading, notFound, error, refetch } = usePublicChannelAnonDetail(channelId, {
    enabled: !authLoading && !user,
  })

  const handleSignInClick = () => {
    // Same flow as a ProtectedRoute bounce (#562): LoginPage and
    // ProtectedRoute consume auth_redirect after sign-in. Best-effort — Web
    // Storage can throw, and losing the hint must not take the page down.
    try {
      sessionStorage.setItem('auth_redirect', channelId ? `/game/${channelId}` : ROUTES.directory)
    } catch (err) {
      console.warn('Could not persist auth redirect', err)
    }
    navigate(ROUTES.login)
  }

  const spinner = (
    <div className="flex justify-center items-center h-40" role="status" aria-label="Loading game">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-500"></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col">
      <Seo path={`/game/${channelId}`} title="Game looking for players — Role by Post" noindex />
      {!user && <MarketingHeader />}

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        {authLoading ? (
          <div className="pt-8">{spinner}</div>
        ) : user ? (
          <div className="pt-8">
            <Link
              to={ROUTES.home}
              className="inline-flex items-center min-h-11 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline"
            >
              Open the app
            </Link>
            <div className="mt-2">
              <PublicListingDetail channelId={channelId} gameSystem={null} />
            </div>
          </div>
        ) : loading ? (
          <div className="pt-8">{spinner}</div>
        ) : error ? (
          <div
            role="alert"
            className="mt-8 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-3 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
          >
            <span>Could not load this game.</span>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold hover:underline"
            >
              Retry
            </button>
          </div>
        ) : notFound || !detail ? (
          <div className="mt-8 rounded-md border border-surface-200 bg-white p-6 text-center dark:border-surface-700 dark:bg-surface-800">
            <h1 className="text-xl font-semibold text-surface-900 dark:text-surface-100">
              This game isn&apos;t listed.
            </h1>
            <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
              It may have stopped recruiting, or the link may be wrong.
            </p>
            <Link
              to={ROUTES.directory}
              className="mt-4 inline-flex items-center min-h-11 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline"
            >
              Browse games looking for players
            </Link>
          </div>
        ) : (
          <div className="pt-8 space-y-4">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-surface-100">
              {detail.name}
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              {gameSystemLabel(detail.game_system)}
            </p>

            {detail.description && (
              <div>
                <h2 className="text-sm font-medium text-surface-900 dark:text-surface-100">About this game</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300">
                  <LinkifiedText text={detail.description} />
                </p>
              </div>
            )}

            {detail.constraints && (
              <div>
                <h2 className="text-sm font-medium text-surface-900 dark:text-surface-100">What the GM expects</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300">
                  <LinkifiedText text={detail.constraints} />
                </p>
              </div>
            )}

            {detail.application_prompt && (
              <div>
                <h2 className="text-sm font-medium text-surface-900 dark:text-surface-100">When you apply</h2>
                <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">{detail.application_prompt}</p>
              </div>
            )}

            <p className="text-xs text-surface-400 dark:text-surface-400">
              Run by {detail.gm_display_name ?? 'an unknown GM'}
            </p>

            <button
              type="button"
              onClick={handleSignInClick}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Sign in to apply
            </button>
            <p className="text-xs text-surface-400 dark:text-surface-400">
              The GM reviews every application before you join. Messages and player details stay inside the campaign.
            </p>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
