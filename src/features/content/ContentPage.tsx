import { Link, useLocation } from 'react-router-dom'
import MarkdownImpl from '../../components/MarkdownImpl'
import { Seo } from '../../components/Seo'
import { ThemeToggle } from '../../components/ThemeToggle'
import { useAuth } from '../auth/useAuth'
import { SiteFooter } from '../marketing/SiteFooter'
import { CONTENT_ROUTES, getContentDoc } from './contentPages'

// Generic prerendered public content page (issue #644): pillar, how-to guides,
// and comparison pages. Must stay Suspense-free — a lazy boundary inside a
// browser-prerendered tree throws React #418 (see App.tsx and verify-hydration).
export function ContentPage() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const route = CONTENT_ROUTES.find((entry) => entry.path === pathname)
  const doc = route ? getContentDoc(route.docSlug) : undefined

  if (!route || !doc) return null

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col">
      <Seo path={pathname} />
      {!user && (
        <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 max-w-3xl mx-auto w-full">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-surface-100">
            <img src="/RoleByPost.png" alt="" width={32} height={32} className="w-8 h-8 rounded" />
            Role by Post
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              className="inline-flex items-center min-h-11 px-4 py-2 text-sm font-medium rounded-md text-primary-700 dark:text-primary-300 hover:bg-surface-100 dark:hover:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              Sign in
            </Link>
          </div>
        </header>
      )}

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16">
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
          <MarkdownImpl>{doc.body}</MarkdownImpl>
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}
