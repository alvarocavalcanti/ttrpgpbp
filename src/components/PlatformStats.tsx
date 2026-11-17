import type { PlatformStats as PlatformStatsData } from '../hooks/usePlatformStats'

const NUMBER = new Intl.NumberFormat('en')

// Public figures round down and gain a "+" above 100, so a number can be stale
// by an hour without ever overstating the platform. Below 100 they are exact —
// a young platform's real number is more convincing than a rounded one.
export function formatStat(n: number): string {
  const value = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  if (value <= 100) return NUMBER.format(value)
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1)
  return `${NUMBER.format(Math.floor(value / magnitude) * magnitude)}+`
}

interface PlatformStatsProps {
  stats: PlatformStatsData | null
  loading: boolean
  /** `public` adds the proof line and the activity rule; `compact` is the Lobby. */
  variant: 'public' | 'compact'
}

// The platform figures (#808). Both surfaces read the same cached row through
// usePlatformStats, so /directory and Discover can never disagree.
//
// Decoration, not the product: a failed fetch renders nothing, and the loading
// state keeps the same labels and line count as the loaded state, so the
// listings below never jump when the numbers arrive.
export function PlatformStats({ stats, loading, variant }: PlatformStatsProps) {
  if (!loading && !stats) return null

  const formatFigure = (n: number | undefined) => (loading || n === undefined ? '—' : formatStat(n))

  const figures = [
    { label: 'Games', value: stats?.games },
    { label: 'Messages sent', value: stats?.messages },
    { label: 'Members', value: stats?.members },
  ]

  // The proof line keeps its shape while loading for the same reason: the band
  // must not grow once the numbers land.
  const proof = loading || !stats
    ? '— active games · — recruiting now · — new this week'
    : `${formatStat(stats.activeGames)} active ${stats.activeGames === 1 ? 'game' : 'games'} · ${formatStat(stats.recruitingGames)} recruiting now · ${formatStat(stats.newGamesWeek)} new this week`

  return (
    <div className="rounded-lg bg-white dark:bg-surface-800 shadow px-4 py-5 sm:p-6">
      {/* One column on phones, three from sm: a 7-digit figure ("9,000,000+")
          cannot fit a third of a 320px screen, and letting it wrap would grow
          the band after the numbers arrive. */}
      <dl aria-label="Platform activity" aria-busy={loading} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {figures.map((figure) => (
          <div key={figure.label} className="min-w-0">
            <dt className="text-sm font-medium text-surface-500 dark:text-surface-400">{figure.label}</dt>
            <dd className="mt-1 text-lg sm:text-2xl font-semibold text-surface-900 dark:text-surface-100 whitespace-nowrap">
              {formatFigure(figure.value)}
            </dd>
          </div>
        ))}
      </dl>

      {variant === 'public' && (
        <>
          <p className="mt-3 text-sm text-surface-600 dark:text-surface-400">{proof}</p>
          {/* Player language on purpose: no table names, no "non-system", no
              "distinct senders", and no hover-only tooltip (no touch path).
              Both gates are stated, or "2 posters" alone would over-promise. */}
          <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
            A game counts as active when at least two people posted at least fifteen messages in it
            during the past two weeks.
          </p>
        </>
      )}
    </div>
  )
}
