import { useEdgeSwipe } from './hooks/useEdgeSwipe'
import { useEscapeToClose } from './hooks/useEscapeToClose'
import { useFocusTrap } from './hooks/useFocusTrap'
import { useTheme } from './hooks/useTheme'
import { BrowserRouter, Routes, Route, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { AuthProvider } from './features/auth/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { useAuth } from './features/auth/useAuth'
import { useDebounce } from './hooks/useDebounce'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ChangelogProvider, useChangelog } from './features/changelog/useChangelog'
import { useIsServerAdmin } from './hooks/useIsServerAdmin'
import { ThemeToggle } from './components/ThemeToggle'
import { RealtimeBanner } from './components/RealtimeBanner'
import { PwaUpdateBanner } from './components/PwaUpdateBanner'
import { PwaInstallBanner } from './components/PwaInstallBanner'
import { ScrollToTop } from './components/ScrollToTop'
import { ErrorBoundary } from './components/ErrorBoundary'
import { trackPageView } from './lib/analytics'

const LoginPage = lazy(() => import('./features/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const ProfileSettings = lazy(() => import('./features/auth/ProfileSettings').then(m => ({ default: m.ProfileSettings })))
const PrivacyPage = lazy(() => import('./features/auth/PrivacyPage').then(m => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('./features/auth/TermsPage').then(m => ({ default: m.TermsPage })))
const AboutPage = lazy(() => import('./features/auth/AboutPage').then(m => ({ default: m.AboutPage })))
const Lobby = lazy(() => import('./features/channels/Lobby').then(m => ({ default: m.Lobby })))
const JoinChannel = lazy(() => import('./features/channels/JoinChannel').then(m => ({ default: m.JoinChannel })))
const ChannelView = lazy(() => import('./features/channels/ChannelView').then(m => ({ default: m.ChannelView })))
const ArchivedChannels = lazy(() => import('./features/channels/ArchivedChannels').then(m => ({ default: m.ArchivedChannels })))
const AdminView = lazy(() => import('./features/admin/AdminView').then(m => ({ default: m.AdminView })))
const HelpPage = lazy(() => import('./features/help/HelpPage').then(m => ({ default: m.HelpPage })))
const ChangelogPage = lazy(() => import('./features/changelog/ChangelogPage').then(m => ({ default: m.ChangelogPage })))
import { useAdminUnread } from './features/admin-messages/useAdminUnread'

const AdminMessagesView = lazy(() => import('./features/admin-messages/AdminMessagesView').then(m => ({ default: m.AdminMessagesView })))

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-surface-50 dark:bg-surface-900 px-4">
      <h1 className="text-xl font-medium text-surface-900 dark:text-surface-100 mb-2">Page not found</h1>
      <p className="text-surface-500 dark:text-surface-400 mb-6">The page you&apos;re looking for does not exist.</p>
      <Link to="/" replace className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 font-medium">Return to Lobby</Link>
    </div>
  )
}

// Shared styling for the nav drawer menu rows; variants compose the prefix
// (e.g. `md:hidden`) or differ in color/layout and stay inline.
const NAV_MENU_ITEM =
  'block w-full text-left px-4 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'

// Fires a GA page_view on every SPA route change (initial load is covered by
// initAnalytics). Only the pathname is reported; search terms (e.g. lobby
// search) are excluded for privacy.
function RouteTracker() {
  const location = useLocation()
  const { pathname } = location

  useEffect(() => {
    trackPageView(pathname)
  }, [pathname])

  return null
}

// Per-navigation error boundary: a crash inside a lazy route (e.g. ChannelView)
// shows the fallback but leaves the nav bar and rest of the app intact. The
// pathname key remounts the boundary on every route change so the fallback
// never sticks across navigation.
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

function AppNav() {
  const { user, signOut } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { isServerAdmin } = useIsServerAdmin()
  const adminUnreadCount = useAdminUnread()
  const { openChangelog } = useChangelog()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  // Right-edge swipe opens the menu drawer (touch devices); same gesture as
  // the channel sidebar so both menus behave identically.
  useEdgeSwipe({ open: menuOpen, onOpen: () => setMenuOpen(true), onClose: () => setMenuOpen(false) })
  // No header X in the drawer (issue #382): close via backdrop tap, edge
  // swipe, the hamburger toggle, or Escape.
  useEscapeToClose(() => setMenuOpen(false))
  // Focus containment while the drawer is open (UX-4).
  const menuRef = useRef<HTMLElement>(null)
  useFocusTrap(menuRef, menuOpen)
  // Local input state so URL search params only update once the query settles
  // (M10), instead of on every keystroke.
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '')
  const debouncedSearch = useDebounce(searchInput, 300)

  useEffect(() => {
    if (debouncedSearch) {
      setSearchParams({ q: debouncedSearch }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }, [debouncedSearch, setSearchParams])

  if (!user || location.pathname.startsWith('/channel/')) return null

  return (
    <header className="bg-white dark:bg-surface-800 shadow-sm p-4 flex justify-between items-center gap-2 relative z-50">
      <Link to="/" replace className="flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-surface-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors truncate min-w-0">
        <img src="/RoleByPost.png" alt="" className="w-8 h-8 rounded" />
        Role by Post
      </Link>
      
      <div className="flex items-center flex-shrink-0 gap-2">
        {location.pathname === '/' && (
          <form className="relative hidden md:block" onSubmit={(e) => e.preventDefault()}>
            <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 110-14 7 7 0 010 14z" />
            </svg>
            <input 
              type="text"
              name="q"
              aria-label="Search channels"
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="bg-white dark:bg-surface-800 w-10 focus:w-64 xl:w-48 pl-9 pr-3 py-1.5 text-sm border border-surface-300 dark:border-surface-600 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 transition-[width] duration-150 placeholder:opacity-0 focus:placeholder:opacity-100 xl:placeholder:opacity-100"
            />
          </form>
        )}
        <span className="hidden md:inline-flex"><ThemeToggle /></span>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="relative p-2 text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {adminUnreadCount > 0 && (
            <span className="absolute top-2 right-2 block h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-surface-800" />
          )}
        </button>

        {menuOpen && (
          <>
            {/* Backdrop: tap anywhere outside the drawer to close (replaces the
                old outside-mousedown handler used by the popup menu). */}
            <div
              data-testid="menu-backdrop"
              className="fixed inset-0 bg-surface-600 bg-opacity-75 dark:bg-surface-900 dark:bg-opacity-80 z-40"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            {/* Right drawer, same layout as the channel sidebar. Rendered
                conditionally, so only the open transition animates. */}
            <nav
              ref={menuRef}
              aria-label="Main menu"
              className="fixed inset-y-0 right-0 z-50 w-80 bg-white dark:bg-surface-800 overflow-y-auto border-l border-surface-200 dark:border-surface-700 shadow-lg motion-safe:animate-slide-in-right"
            >
            <Link
              to="/settings"
              className={NAV_MENU_ITEM}
              onClick={() => setMenuOpen(false)}
            >
              Profile
            </Link>
            {/* Folded-in header controls on compact screens (issue #382): search + dark
              mode. Search is lobby-only, matching the header search. */}
            {location.pathname === '/' && (
              <>
                <div className="md:hidden border-t border-surface-100 dark:border-surface-700 my-1"></div>
                <div className="md:hidden px-4 py-2">
                  <form onSubmit={(e) => e.preventDefault()}>
                    <input
                      type="text"
                      aria-label="Search channels in menu"
                      placeholder="Search channels..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-full bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 rounded-md shadow-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </form>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className={`md:hidden ${NAV_MENU_ITEM}`}
            >
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>
            <Link 
              to="/archived" 
              className={NAV_MENU_ITEM}
              onClick={() => setMenuOpen(false)}
            >
              Archived Channels
            </Link>
            <Link
              to="/messages"
              className="flex justify-between items-center w-full text-left px-4 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"
              onClick={() => setMenuOpen(false)}
            >
              <span>Messages</span>
              {adminUnreadCount > 0 && (
                <span className="flex h-2 w-2 rounded-full bg-red-500" />
              )}
            </Link>
            <Link 
              to="/help" 
              className={NAV_MENU_ITEM}
              onClick={() => setMenuOpen(false)}
            >
              Help
            </Link>
            <Link
              to="/about"
              className={NAV_MENU_ITEM}
              onClick={() => setMenuOpen(false)}
            >
              About
            </Link>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                openChangelog()
              }}
              className={NAV_MENU_ITEM}
            >
              Change Log
            </button>
            <Link 
              to="/privacy" 
              className={NAV_MENU_ITEM}
              onClick={() => setMenuOpen(false)}
            >
              Privacy Policy
            </Link>
            <Link 
              to="/terms" 
              className={NAV_MENU_ITEM}
              onClick={() => setMenuOpen(false)}
            >
              Terms of Service
            </Link>
            {isServerAdmin && (
              <Link 
                to="/admin" 
                className={NAV_MENU_ITEM}
                onClick={() => setMenuOpen(false)}
              >
                Server Admin
              </Link>
            )}
            <div className="border-t border-surface-100 dark:border-surface-700 my-1"></div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
              className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700"
            >
              Sign Out
            </button>
            </nav>
          </>
        )}
      </div>
    </header>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <RouteTracker />
          <ChangelogProvider>
            <div className="min-h-[100dvh] bg-surface-50 dark:bg-surface-900 flex flex-col">
              <AppNav />
              <RealtimeBanner />
              <PwaUpdateBanner />
              <PwaInstallBanner />
              <main className="flex-1 flex flex-col">
                <Suspense fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                }>
                <RouteErrorBoundary>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    
                    <Route element={<ProtectedRoute />}>
                      <Route path="/" element={<Lobby />} />
                      <Route path="/archived" element={<ArchivedChannels />} />
                      <Route path="/messages" element={<AdminMessagesView />} />
                      <Route path="/admin" element={<AdminView />} />
                      <Route path="/join/:id" element={<JoinChannel />} />
                      <Route path="/channel/:id" element={<ChannelView />} />
                      <Route path="/settings" element={<ProfileSettings />} />
                      <Route path="/help" element={<HelpPage />} />
                      <Route path="/help/:topic" element={<HelpPage />} />
                      <Route path="/changelog" element={<ChangelogPage />} />
                      <Route path="/about" element={<AboutPage />} />
                    </Route>
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </RouteErrorBoundary>
              </Suspense>
              </main>
            </div>
          </ChangelogProvider>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
