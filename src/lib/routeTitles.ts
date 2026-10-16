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
const DEFAULT_TITLE = 'Role by Post'

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
// public route's title (which already carries the brand suffix), else the brand
// alone.
//
// '/' resolves to 'Lobby' here, which is the signed-in case — the signed-out
// landing page renders its own <Seo> outside the protected routes and never
// consults this.
export function titleForPath(pathname: string): string {
  const path = normalizePath(pathname)

  const app = APP_TITLE_MATCHERS.find((entry) => entry.matcher.test(path))
  if (app) return app.title

  const route = PUBLIC_ROUTES.find((entry) => entry.path === path)
  return route ? route.title : DEFAULT_TITLE
}
