import { Link } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { isPrerender } from '../../lib/automation'
import { ROUTES } from '../../lib/publicRoutes'
import { trackEvent } from '../../lib/analytics'
import { useAuth } from '../auth/useAuth'
import { MarketingHeader } from '../marketing/MarketingHeader'
import { SiteFooter } from '../marketing/SiteFooter'
import { usePublicChannelsAnon } from './usePublicChannelsAnon'

// Public, indexable directory of listed channels (#674 Phase 1.5).
//
// Anonymous visitors and crawlers see GM-authored name + description only, and
// every action routes to sign-in. The page is a prerendered shell plus a
// client-fetched list: at build time only the intro copy is captured, so a
// failed or slow fetch can never bake an error or a stale page into the static
// HTML, and a failed fetch at runtime degrades to the intro rather than a blank
// page.
export function DirectoryPage() {
  const { user } = useAuth()
  const prerender = isPrerender()
  const { channels, loading, loadingMore, error, loadMoreError, hasMore, refetch, loadMore } =
    usePublicChannelsAnon({ enabled: !prerender })

  const handleSignInClick = () => {
    trackEvent('directory_signin_click')
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col">
      <Seo path={ROUTES.directory} />
      {!user && <MarketingHeader />}

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <h1 className="pt-8 text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-surface-100">
          Games looking for players
        </h1>
        <p className="mt-3 text-surface-600 dark:text-surface-400">
          Tabletop RPG campaigns recruiting players right now. Each listing is written by its Game
          Master — what the game is about and what they expect from the table. Sign in to apply;
          the GM reviews every application before you join.
        </p>
        <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
          Messages and player details always stay inside the campaign.
        </p>

        {user && (
          <p className="mt-4">
            <Link
              to={ROUTES.home}
              className="inline-flex items-center min-h-11 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:underline"
            >
              Open the app
            </Link>
          </p>
        )}

        <section aria-label="Listed games" className="mt-6">
          {/* The prerender pass contributes the intro above plus this loading
              shell — exactly what the client's first paint shows, so hydration
              matches — but never a list, an empty state, or an error that could
              go stale between deploys. */}
          {prerender || loading ? (
            <div className="flex justify-center items-center h-40" role="status" aria-label="Loading games">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-primary-500"></div>
            </div>
          ) : error ? (
            // The intro above stays; only the list is replaced.
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-3 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
            >
              <span>Couldn't load the games.</span>
              <button
                type="button"
                onClick={refetch}
                className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold hover:underline"
              >
                Retry
              </button>
            </div>
          ) : channels.length === 0 ? (
            <div className="rounded-md border border-surface-200 bg-white p-6 text-center text-sm text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400">
              No games listed yet.
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {channels.map((channel, index) => (
                  // The projection carries no id by design, and this list only
                  // ever appends, so the index is a stable key here.
                  <li key={index}>
                    <Link
                      to={ROUTES.login}
                      onClick={handleSignInClick}
                      className="block rounded-md border border-surface-200 bg-white p-4 shadow-sm transition-colors hover:border-primary-300 hover:bg-surface-50 dark:border-surface-700 dark:bg-surface-800 dark:hover:border-primary-700 dark:hover:bg-surface-700"
                    >
                      <h2 className="text-base font-semibold text-surface-900 dark:text-surface-100">
                        {channel.name}
                      </h2>
                      {channel.description && (
                        <p className="mt-1 line-clamp-3 text-sm text-surface-600 dark:text-surface-400">
                          {channel.description}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>

              {hasMore && (
                <div className="mt-4 space-y-2">
                  {loadMoreError && (
                    <p role="alert" className="text-center text-sm text-red-700 dark:text-red-400">
                      Couldn't load more games.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="w-full inline-flex justify-center rounded-md border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-surface-700 shadow-sm hover:bg-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
                  >
                    {loadingMore ? 'Loading...' : loadMoreError ? 'Try again' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
