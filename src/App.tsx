import { BrowserRouter, Routes, Route, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { AuthProvider } from './features/auth/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { useAuth } from './features/auth/useAuth'
import { LoginPage } from './features/auth/LoginPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ProfileSettings } from './features/auth/ProfileSettings'
import { Lobby } from './features/channels/Lobby'
import { JoinChannel } from './features/channels/JoinChannel'
import { ChannelView } from './features/channels/ChannelView'
import { ArchivedChannels } from './features/channels/ArchivedChannels'
import { AdminView } from './features/admin/AdminView'
import { HelpPage } from './features/help/HelpPage'

function AppNav() {
  const { user, profile, signOut } = useAuth()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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
    <header className="bg-white shadow-sm p-4 flex justify-between items-center gap-2 relative z-50">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold text-gray-900 hover:text-indigo-600 transition-colors truncate">
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
              value={searchParams.get('q') || ''}
              onChange={(e) => {
                if (e.target.value) {
                  setSearchParams({ q: e.target.value }, { replace: true })
                } else {
                  setSearchParams({}, { replace: true })
                }
              }}
              className="w-24 sm:w-48 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </form>
        )}
        <button 
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-md focus:outline-none"
          aria-label="Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-4 top-14 mt-2 w-48 bg-white rounded-md shadow-lg py-1 border border-gray-200 z-50">
            <Link 
              to="/settings" 
              className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setMenuOpen(false)}
            >
              <div className="mr-3 flex-shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="w-6 h-6 rounded-full object-cover shadow-sm" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 shadow-sm">
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
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setMenuOpen(false)}
            >
              Archived Channels
            </Link>
            <Link 
              to="/help" 
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              onClick={() => setMenuOpen(false)}
            >
              Help
            </Link>
            {profile?.server_admin && (
              <Link 
                to="/admin" 
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setMenuOpen(false)}
              >
                Server Admin
              </Link>
            )}
            <div className="border-t border-gray-100 my-1"></div>
            <button 
              onClick={() => {
                setMenuOpen(false)
                signOut()
              }}
              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
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
          <div className="min-h-screen bg-gray-50 flex flex-col">
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
                </Route>
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App

