import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext'
import { useAuth } from './features/auth/useAuth'
import { LoginPage } from './features/auth/LoginPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ProfileSettings } from './features/auth/ProfileSettings'
import { Lobby } from './features/channels/Lobby'
import { JoinChannel } from './features/channels/JoinChannel'
import { ChannelView } from './features/channels/ChannelView'

function AppNav() {
  const { user, profile, signOut } = useAuth()

  if (!user) return null

  return (
    <header className="bg-white shadow-sm p-4 flex justify-between items-center">
      <Link to="/" className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors">
        TTRPG Play-by-Post
      </Link>
      
      <div className="flex items-center space-x-4">
        <Link to="/settings" className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900">
          {profile?.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt="Avatar" 
              className="w-8 h-8 rounded-full object-cover shadow-sm"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 shadow-sm">
              <span className="text-sm font-medium">
                {profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
          )}
          <span className="hidden sm:inline-block">{profile?.display_name || 'Profile'}</span>
        </Link>
        <button 
          onClick={signOut}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <AppNav />
          <main className="flex-1 flex flex-col">
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Lobby />} />
                <Route path="/join/:id" element={<JoinChannel />} />
                <Route path="/channel/:id" element={<ChannelView />} />
                <Route path="/settings" element={<ProfileSettings />} />
              </Route>
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

