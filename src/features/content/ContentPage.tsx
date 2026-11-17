import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import MarkdownImpl from '../../components/MarkdownImpl'
import { Seo } from '../../components/Seo'
import { AuthorByline } from '../../components/AuthorByline'
import { ImageViewerModal } from '../../components/ImageViewerModal'
import { normalizePath } from '../../lib/publicRoutes'
import { CONTENT_ROUTES } from '../../lib/contentRoutes'
import type { ContentShot } from '../../lib/contentRoutes'
import { thumbSrc } from '../../lib/helpImages'
import { trackEvent } from '../../lib/analytics'
import { useAuth } from '../auth/useAuth'
import { MarketingHeader } from '../marketing/MarketingHeader'
import { SiteFooter } from '../marketing/SiteFooter'
import { getContentDoc } from './contentPages'

// Placement marker for a doc's in-flow screenshots (see CONTENT_ROUTES.shots).
// A marker rather than a heading parse, so where the gallery lands is explicit
// and never guessed from the prose.
// shortcut: one marker per doc; upgrade to a remark directive if a page ever
// needs two galleries.
const SHOT_MARKER = '<!-- shots -->'

const CTA_BUTTON =
  'inline-flex items-center justify-center min-h-11 px-6 py-3 text-base font-semibold rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors'

// Signed-out visitors go straight to sign-in. Every placement reports its own
// `location` so the comparison pages can be measured separately from each
// other and from /features (whose CTA also serves signed-in visitors).
function CtaButton({ location, path }: { location: string; path: string }) {
  return (
    <Link
      to="/login"
      onClick={() => trackEvent('marketing_cta_click', { location, path })}
      className={CTA_BUTTON}
    >
      Start now
    </Link>
  )
}

function CtaCard({ location, path, copy }: { location: string; path: string; copy: string }) {
  return (
    <div className="not-prose my-8 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-5 sm:p-6 text-center shadow-sm">
      <p className="text-base font-semibold text-surface-900 dark:text-surface-100">{copy}</p>
      <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">
        Free to play. Sign in with Google or a one-time email link.
      </p>
      <div className="mt-4">
        <CtaButton location={location} path={path} />
      </div>
    </div>
  )
}

// The doc's screenshots, each in a phone frame, opening the shared enlarged
// viewer. The grid resolves its own viewer index so a gallery click can never
// open the wrong image after a track/route change.
function ShotGrid({ shots, path }: { shots: ContentShot[]; path: string }) {
  const [viewing, setViewing] = useState<number | null>(null)
  const current = viewing !== null ? shots[viewing] : undefined

  return (
    <>
      <div className="not-prose my-8 grid gap-6 sm:grid-cols-2">
        {shots.map((shot, index) => (
          <figure key={shot.src} className="m-0">
            <button
              type="button"
              onClick={() => {
                setViewing(index)
                trackEvent('content_image_open', { src: shot.src, path })
              }}
              aria-label={`View ${shot.caption} fullscreen`}
              className="mx-auto block cursor-zoom-in rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <img
                src={thumbSrc(shot.src)}
                alt={shot.alt}
                width={360}
                height={780}
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : undefined}
                className="w-40 sm:w-48 h-auto block rounded-xl border-2 border-surface-200 dark:border-surface-700 shadow"
              />
            </button>
            <figcaption className="mt-2 text-center text-xs text-surface-600 dark:text-surface-400">
              {shot.caption}
            </figcaption>
          </figure>
        ))}
      </div>

      {current && (
        <ImageViewerModal
          src={current.src}
          alt={current.alt}
          onClose={() => setViewing(null)}
          onPrev={viewing !== null && viewing > 0 ? () => setViewing(viewing - 1) : undefined}
          onNext={
            viewing !== null && viewing < shots.length - 1 ? () => setViewing(viewing + 1) : undefined
          }
        />
      )}
    </>
  )
}

// Generic prerendered public content page (issue #644): pillar, how-to guides,
// and comparison pages. Must stay Suspense-free — a lazy boundary inside a
// browser-prerendered tree throws React #418 (see App.tsx and verify-hydration).
export function ContentPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const path = normalizePath(pathname)
  const route = CONTENT_ROUTES.find((entry) => entry.path === path)
  const doc = route ? getContentDoc(route.docSlug) : undefined

  if (!route || !doc) return null

  const markerAt = doc.body.indexOf(SHOT_MARKER)
  const hasMarker = markerAt !== -1
  const lead = hasMarker ? doc.body.slice(0, markerAt).trim() : ''
  const rest = hasMarker ? doc.body.slice(markerAt + SHOT_MARKER.length).trim() : doc.body

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col">
      <Seo path={path} image={route.ogImage} />
      {!user && <MarketingHeader />}

      <main
        className={`flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 ${
          // Only the phone-only start bar needs the extra room.
          user ? 'pb-16' : 'pb-28 md:pb-16'
        }`}
      >
        <nav aria-label="Breadcrumb" className="pt-6 pb-2">
          <ol className="flex flex-wrap items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
            {route.breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden="true">/</span>}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-surface-700 dark:text-surface-300">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <article className="prose prose-sm sm:prose-base max-w-none dark:prose-invert">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-surface-100">
            {doc.title}
          </h1>
          {hasMarker && <MarkdownImpl>{lead}</MarkdownImpl>}
          {hasMarker && route.shots && <ShotGrid shots={route.shots} path={path} />}
          {hasMarker && !user && <CtaCard location="after_intro" path={path} copy="Play your next campaign here" />}
          <MarkdownImpl>{rest}</MarkdownImpl>
        </article>

        {!user && <CtaCard location="bottom" path={path} copy="Your table is waiting" />}

        <AuthorByline />
      </main>

      {/* Sticky start bar, phones only. CSS-only (no viewport JS) so the
          prerendered signed-out markup hydrates identically everywhere.
          z-20 stays under the footer's mobile disclosure (z-30/z-40). */}
      {!user && (
        <div className="fixed inset-x-0 bottom-0 z-20 md:hidden border-t border-surface-200 dark:border-surface-700 bg-white/95 dark:bg-surface-800/95 backdrop-blur px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-surface-700 dark:text-surface-300">Free to play</p>
            <CtaButton location="sticky" path={path} />
          </div>
        </div>
      )}

      {/* Reserve the sticky bar's height below the footer too, so its summary
          row is never covered on a phone. */}
      <div className={user ? undefined : 'pb-20 md:pb-0'}>
        <SiteFooter />
      </div>
    </div>
  )
}
