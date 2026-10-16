import { PUBLIC_ROUTES, ROUTES, normalizePath } from './publicRoutes'

// Titles for the app's own routes — the client-rendered, noindex screens behind
// sign-in.
//
// Two things depend on them: the browser tab, which read "Role by Post" on every
// screen, and GA4's Pages report, whose rows ARE page titles. The app routes have
// no PUBLIC_ROUTES entry, so every one of them fell back to the bare brand name
// and 60% of page views landed in a single indistinguishable row.
//
// `:param` matches one path segment. Each pattern is anchored, so '/channel/:id'
// can never swallow '/channel/:id/sub/:subId' — the order below is only a
// readability choice.
const APP_ROUTE_TITLES: { pattern: string; title: string }[] = [
  { pattern: ROUTES.home, title: 'Lobby' },
  { pattern: ROUTES.archived, title: 'Archived Channels' },
  { pattern: ROUTES.messages, title: 'Messages' },
  { pattern: ROUTES.admin, title: 'Server Admin' },
  { pattern: ROUTES.adminChannel, title: 'Channel' },
  { pattern: ROUTES.join, title: 'Join a Channel' },
  { pattern: ROUTES.channelRoom, title: 'Channel' },
  { pattern: ROUTES.channel, title: 'Channel' },
  { pattern: ROUTES.settings, title: 'Settings' },
  { pattern: ROUTES.changelog, title: 'Changelog' },
  { pattern: ROUTES.about, title: 'About' },
  { pattern: ROUTES.login, title: 'Sign in' },
]

const SUFFIX = ' — Role by Post'
// An unmatched path renders the not-found screen, which titles itself this way.
const DEFAULT_TITLE = 'Page not found — Role by Post'

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/')
  return new RegExp(`^${escaped}$`)
}

const APP_TITLE_MATCHERS = APP_ROUTE_TITLES.map((entry) => ({
  matcher: patternToRegExp(entry.pattern),
  title: `${entry.title}${SUFFIX}`,
}))

// The document title for a path: the app's own title where it has one, else the
// public route's title, else the not-found title.
//
// `authenticated` only matters for '/', the one path that is two different pages:
// the signed-out landing page and the signed-in lobby. Resolving it from the path
// alone would file every signed-out visit under the lobby. This reads the caller's
// auth state rather than `document.title` on purpose — on a lazy route the page
// view fires before the route's <Seo> mounts, so document.title still holds the
// previous screen's title and the hit would be attributed to the wrong page.
export function titleForPath(pathname: string, authenticated: boolean): string {
  const path = normalizePath(pathname)

  if (path === ROUTES.home && !authenticated) {
    const landing = PUBLIC_ROUTES.find((entry) => entry.path === ROUTES.home)
    return landing ? landing.title : DEFAULT_TITLE
  }

  const app = APP_TITLE_MATCHERS.find((entry) => entry.matcher.test(path))
  if (app) return app.title

  const route = PUBLIC_ROUTES.find((entry) => entry.path === path)
  return route ? route.title : DEFAULT_TITLE
}
