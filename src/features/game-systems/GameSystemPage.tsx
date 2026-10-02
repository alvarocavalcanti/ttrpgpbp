import { Link, Navigate, useParams } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { AuthorByline } from '../../components/AuthorByline'
import { ROUTES } from '../../lib/publicRoutes'
import { useAuth } from '../auth/useAuth'
import { MarketingHeader } from '../marketing/MarketingHeader'
import { SiteFooter } from '../marketing/SiteFooter'
import { GAME_SYSTEMS, getModifierLimits } from '../../game-systems'
import { GAME_SYSTEM_COPY } from '../../game-systems/marketing'

// Public, prerendered landing page for a supported game system (issue #645).
// Content lives in src/game-systems/marketing.ts; the attribute list and
// modifier bounds come from the same registry the app uses. Suspense-free so
// the browser-prerendered markup hydrates cleanly.
export function GameSystemPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user } = useAuth()
  // Own-property checks: a crafted slug like `toString` would otherwise return
  // an inherited Object.prototype member and crash the render.
  const copy =
    slug && Object.hasOwn(GAME_SYSTEM_COPY, slug) ? GAME_SYSTEM_COPY[slug] : undefined
  const system = slug && Object.hasOwn(GAME_SYSTEMS, slug) ? GAME_SYSTEMS[slug] : undefined

  if (!copy || !system) return <Navigate to={ROUTES.features} replace />

  const path = `/game-systems/${copy.slug}`
  const limits = getModifierLimits(system.id)

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col">
      <Seo path={path} />
      {!user && <MarketingHeader />}

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <h1 className="pt-8 text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-surface-100">
          {copy.heading}
        </h1>
        <p className="mt-3 text-surface-600 dark:text-surface-400">{copy.intro}</p>

        <div className="mt-6 rounded-lg border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-800">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
            {`${system.name} attributes`}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {system.attributes.map((attribute) => (
              <li
                key={attribute}
                className="rounded border border-surface-300 px-2 py-1 font-mono text-sm text-surface-800 dark:border-surface-600 dark:text-surface-200"
              >
                {attribute}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-surface-500 dark:text-surface-400">
            {`Modifiers run from ${limits.min} to ${limits.max}, and out-of-range values are corrected when saved.`}
          </p>
        </div>

        <section className="prose prose-sm sm:prose-base mt-10 max-w-none dark:prose-invert">
          {copy.sections.map((section) => (
            <div key={section.heading}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ))}

          <h2>Example rolls</h2>
          <ul>
            {copy.exampleRolls.map((roll) => (
              <li key={roll.notation}>
                <code>{roll.notation}</code>
                {` — ${roll.label}`}
              </li>
            ))}
          </ul>
          <p>
            {'Try any of these in the '}
            <Link to={ROUTES.diceRoller}>public dice roller</Link>
            {', or start a channel and roll them into the story.'}
          </p>
        </section>

        <AuthorByline />
      </main>

      <SiteFooter />
    </div>
  )
}
