import { BrowserRouter, Routes, Route, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { AuthProvider } from './features/auth/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { useAuth } from './features/auth/useAuth'
import { useDebounce } from './hooks/useDebounce'
import { LoginPage } from './features/auth/LoginPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ProfileSettings } from './features/auth/ProfileSettings'
import { PrivacyPage } from './features/auth/PrivacyPage'
import { AboutPage } from './features/auth/AboutPage'
import { Lobby } from './features/channels/Lobby'
import { JoinChannel } from './features/channels/JoinChannel'
import { ChannelView } from './features/channels/ChannelView'
import { ArchivedChannels } from './features/channels/ArchivedChannels'
import { AdminView } from './features/admin/AdminView'
import { HelpPage } from './features/help/HelpPage'
import { ChangelogPage } from './features/changelog/ChangelogPage'
import { ChangelogProvider, useChangelog } from './features/changelog/useChangelog'
import { useIsServerAdmin } from './hooks/useIsServerAdmin'
import { ThemeToggle } from './components/ThemeToggle'

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 px-4">
      <h1 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">Page not found</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">The page you&apos;re looking for does not exist.</p>
      <Link to="/" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium">Return to Lobby</Link>
    </div>
  )
}

function AppNav() {
  const { user, profile, signOut } = useAuth()
  const { isServerAdmin } = useIsServerAdmin()
  const { openChangelog } = useChangelog()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!user || location.pathname.startsWith('/channel/')) return null

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm p-4 flex justify-between items-center gap-2 relative z-50">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate">
        <img src="/RoleByPost.png" alt="" className="w-8 h-8 rounded" />
        RoleByPost
      </Link>
      
      <div className="flex items-center flex-shrink-0 gap-2" ref={menuRef}>
        {location.pathname === '/' && (
          <form className="relative flex items-center" onSubmit={(e) => e.preventDefault()}>
            <input 
              type="text"
              name="q"
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="bg-white dark:bg-gray-800 w-24 sm:w-48 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </form>
        )}
        <ThemeToggle />
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-4 top-14 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 border border-gray-200 dark:border-gray-700 z-50">
            <Link 
              to="/settings" 
              className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setMenuOpen(false)}
            >
              <div className="mr-3 flex-shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-6 h-6 rounded-full object-cover shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shadow-sm">
                    <span className="text-xs font-medium">
                      {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
              </div>
              <span className="truncate">{profile?.display_name || 'Settings'}</span>
            </Link>
            <Link 
              to="/archived" 
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setMenuOpen(false)}
            >
              Archived Channels
            </Link>
            <Link 
              to="/help" 
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setMenuOpen(false)}
            >
              Help
            </Link>
            <Link
              to="/about"
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
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
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Change Log
            </button>
            <Link 
              to="/privacy" 
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setMenuOpen(false)}
            >
              Privacy Policy
            </Link>
            {isServerAdmin && (
              <Link 
                to="/admin" 
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => setMenuOpen(false)}
              >
                Server Admin
              </Link>
            )}
            <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
              className="block w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <ChangelogProvider>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
              <AppNav />
              <main className="flex-1 flex flex-col">
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  
                  <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<Lobby />} />
                    <Route path="/archived" element={<ArchivedChannels />} />
                    <Route path="/admin" element={<AdminView />} />
                    <Route path="/join/:id" element={<JoinChannel />} />
                    <Route path="/channel/:id" element={<ChannelView />} />
                    <Route path="/settings" element={<ProfileSettings />} />
                    <Route path="/help" element={<HelpPage />} />
                    <Route path="/help/:topic" element={<HelpPage />} />
                    <Route path="/changelog" element={<ChangelogPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/about" element={<AboutPage />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
            </div>
          </ChangelogProvider>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
