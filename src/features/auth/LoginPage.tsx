import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import { ThemeToggle } from '../../components/ThemeToggle'

const FEATURES = [
  {
    title: 'Real-time Chat',
    description: 'Markdown messages, scene breaks, whispers, and daily date dividers keep the story flowing.',
    icon: (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    ),
  },
  {
    title: 'Dice Rolling',
    description: 'Clickable dice notation, advantage and disadvantage, and built-in ability checks.',
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    title: 'Campaign Management',
    description: 'Private channels with invite links, character tracking, and persistent status bars.',
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    title: 'Push Notifications',
    description: 'Stay in the loop with web push alerts when it\'s your turn or new messages arrive.',
    icon: (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ),
  },
  {
    title: 'Mobile First',
    description: 'Designed to feel like a native chat app, on your phone or on the web.',
    icon: (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </>
    ),
  },
]

export function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  const handleSignIn = async () => {
    const from = (location.state as { from?: string } | null)?.from
    if (from) {
      sessionStorage.setItem('auth_redirect', from)
    }
    await signInWithGoogle()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center py-10 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-4xl">
        <div className="max-w-md w-full mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-md p-8">
          <div>
            <div className="flex items-center justify-center gap-3 mt-6">
              <img src="/RoleByPost.png" alt="RoleByPost" className="w-12 h-12 rounded" />
              <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
                RoleByPost
              </h2>
            </div>
            <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
              Sign in to access your campaigns
            </p>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={handleSignIn}
              className="group relative w-full flex justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>

        <section className="mt-12 max-w-2xl mx-auto text-center">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Text-first, no bloat
          </h3>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            RoleByPost is a chat-first app for asynchronous tabletop RPGs, with a few quality-of-life tools to keep play moving. Bring any tabletop RPG: generic play is built in, with optional Shadowdark character stats when useful.
          </p>

          <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-left shadow-sm">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Not a VTT
            </h4>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              You won&apos;t find battle maps, tactical combat automation, animated dice, or AI-generated content here. RoleByPost keeps the conversation flowing while reducing app and tab switching.
            </p>
          </div>
        </section>

        <div className="mt-14">
          <h3 className="text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
            Why RoleByPost?
          </h3>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            The home for asynchronous tabletop roleplaying
          </p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    {feature.icon}
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{feature.title}</h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
