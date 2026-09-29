import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from './useAuth'
import { isSafeRedirectPath } from './AuthContext'
import { CURRENT_TERMS_VERSION, TERMS_AGREED_KEY } from './terms'
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

// Permissive shape check only: this is a UX speed bump, the address still has
// to be deliverable. Kept local (not native type=email validity) so it is
// deterministic in jsdom and rejects before any network call.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// Magic links that expired, were reused, or were tampered with redirect back
// with `#error=...&error_code=...`. supabase-js consumes successful links
// silently but leaves the failing fragment in place and never notifies
// subscribers, so this is the only place the user can be told what happened.
export function readMagicLinkError(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  if (!params.get('error') && !params.get('error_code')) return null
  if (params.get('error_code') === 'otp_expired') {
    return 'This sign-in link has expired or was already used. Request a new one below.'
  }
  return "This sign-in link isn't valid. Request a new one below."
}

// Web Storage can throw — quota exhausted, or storage disabled in private
// browsing. A redirect hint is best-effort: failing to persist it must not take
// the sign-in page down through the route error boundary, the user just lands
// on the lobby instead.
function persistAuthRedirect(path: string) {
  try {
    sessionStorage.setItem('auth_redirect', path)
  } catch (err) {
    console.warn('Could not persist auth redirect', err)
  }
}

export function LoginPage() {
  const { user, loading, signInWithGoogle, signInWithEmail } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // Required age + terms confirmation. Persisted per-device so returning users
  // aren't asked again; the server-side evidence is stamped by confirm_age()
  // and confirm_terms() on first authenticated load (see AuthContext). The
  // terms agreement records the exact version shown, so a terms bump
  // invalidates it and returning users re-confirm explicitly.
  const [ageConfirmed, setAgeConfirmed] = useState(() => localStorage.getItem('age-confirmed') === 'true')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [emailStatus, setEmailStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [emailSendError, setEmailSendError] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [linkError] = useState<string | null>(() => readMagicLinkError())

  // The magic link carries the intended destination in `?redirect=`; seed the
  // existing sessionStorage hand-off so ProtectedRoute can honour it once the
  // session lands. sessionStorage alone would not survive a link opened in a
  // new tab or on another device (fallback: lobby).
  const redirectParam = searchParams.get('redirect')
  useEffect(() => {
    if (isSafeRedirectPath(redirectParam)) {
      persistAuthRedirect(redirectParam)
    }
  }, [redirectParam])

  // Clear the magic-link error fragment so a refresh does not re-show it
  // (supabase-js leaves the hash untouched on the error path).
  useEffect(() => {
    if (!linkError) return
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }, [linkError])

  // Client-side resend cooldown: magic-link requests are rate-limited server
  // side, and a burst of resends would otherwise only surface as a 429.
  // ponytail: fixed 60s window; switch to the server's Retry-After if it ever matters.
  useEffect(() => {
    if (!resendAvailableAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [resendAvailableAt])
  const resendSecondsLeft = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-primary-500"></div>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  const from = (location.state as { from?: string } | null)?.from

  const handleSignIn = async () => {
    if (!ageConfirmed) return
    if (from) {
      persistAuthRedirect(from)
    }
    await signInWithGoogle()
  }

  const handleAgeChange = (checked: boolean) => {
    setAgeConfirmed(checked)
    if (checked) {
      localStorage.setItem('age-confirmed', 'true')
      localStorage.setItem(TERMS_AGREED_KEY, CURRENT_TERMS_VERSION)
    } else {
      localStorage.removeItem('age-confirmed')
      localStorage.removeItem(TERMS_AGREED_KEY)
    }
  }

  const sendMagicLink = async (address: string) => {
    setEmailSendError('')
    setEmailStatus('submitting')
    const { error } = await signInWithEmail(address, from)
    if (error) {
      setEmailStatus('error')
      setEmailSendError("We couldn't send your sign-in link. Check the address and try again.")
      return
    }
    setSubmittedEmail(address)
    setEmailStatus('idle')
    setResendAvailableAt(Date.now() + 60_000)
  }

  const handleEmailSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ageConfirmed || emailStatus === 'submitting') return
    const address = email.trim()
    if (!isValidEmail(address)) {
      setEmailError('Enter a valid email address.')
      return
    }
    setEmailError('')
    await sendMagicLink(address)
  }

  const handleResend = async () => {
    if (!submittedEmail || emailStatus === 'submitting' || resendSecondsLeft > 0) return
    await sendMagicLink(submittedEmail)
  }

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center py-10 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-4xl">
        <div className="max-w-md w-full mx-auto bg-white dark:bg-surface-800 rounded-xl shadow-md p-8">
          <div>
            <div className="flex items-center justify-center gap-3 mt-6">
              <img src="/RoleByPost.png" alt="Role by Post" className="w-12 h-12 rounded" />
              <h2 className="text-3xl font-extrabold text-surface-900 dark:text-surface-100">
                Role by Post
              </h2>
            </div>
            <p className="mt-4 text-center text-base font-medium text-surface-900 dark:text-surface-100">
              A text-based tabletop RPG platform
            </p>
            <p className="mt-2 text-center text-sm text-surface-600 dark:text-surface-400">
              Sign in with Google or an email link to securely create and access your roleplaying campaigns.
            </p>
          </div>

          {linkError && (
            <div role="alert" className="mt-6 rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              {linkError}
            </div>
          )}

          <div className="mt-8">
            <div className="flex items-start gap-2 mb-4">
              <input
                id="age-confirm"
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => handleAgeChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-surface-300 dark:border-surface-600 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="age-confirm" className="text-sm text-surface-600 dark:text-surface-400">
                I am at least 16 years old and agree to the{' '}
                <Link to="/terms" className="text-primary-600 dark:text-primary-400 hover:underline">Terms of Service</Link>
                {` (v${CURRENT_TERMS_VERSION}) `}
                and{' '}
                <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline">Privacy Policy</Link>
              </label>
            </div>
            <button
              type="button"
              onClick={handleSignIn}
              disabled={!ageConfirmed}
              className="group relative w-full flex justify-center py-3 px-4 border border-surface-300 dark:border-surface-600 text-sm font-medium rounded-md text-surface-700 dark:text-surface-300 bg-white dark:bg-surface-800 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-surface-800"
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

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-surface-200 dark:border-surface-700"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white dark:bg-surface-800 px-2 text-surface-500 dark:text-surface-400">or</span>
              </div>
            </div>

            {submittedEmail ? (
              <div role="status" className="rounded-md border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 px-4 py-4">
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-100">Check your email</p>
                <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">
                  We sent a sign-in link to{' '}
                  <span className="font-medium text-surface-900 dark:text-surface-100">{submittedEmail}</span>.
                  The link expires in 1 hour.
                </p>
                {emailSendError && (
                  <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{emailSendError}</p>
                )}
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={emailStatus === 'submitting' || resendSecondsLeft > 0}
                    className="w-full justify-center py-2 px-4 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailStatus === 'submitting'
                      ? 'Sending…'
                      : resendSecondsLeft > 0
                        ? `Resend link (${resendSecondsLeft}s)`
                        : 'Resend link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmittedEmail('')
                      setEmail('')
                      setEmailSendError('')
                      setEmailStatus('idle')
                    }}
                    className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} noValidate>
                <label htmlFor="email" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError('')
                  }}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? 'email-error' : undefined}
                  className="mt-1 block w-full rounded-md border border-surface-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-3 py-2 text-sm text-surface-900 dark:text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="you@example.com"
                />
                {emailError && (
                  <p id="email-error" role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{emailError}</p>
                )}
                {emailStatus === 'error' && emailSendError && (
                  <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{emailSendError}</p>
                )}
                <button
                  type="submit"
                  disabled={!ageConfirmed || emailStatus === 'submitting'}
                  className="mt-3 w-full flex justify-center py-2.5 px-4 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {emailStatus === 'submitting' ? 'Sending…' : 'Email me a sign-in link'}
                </button>
              </form>
            )}
          </div>
        </div>

        <section className="mt-12 max-w-2xl mx-auto text-center">
          <h3 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
            Text-first, no bloat
          </h3>
          <p className="mt-2 text-sm sm:text-base text-surface-600 dark:text-surface-400">
            Role by Post is a chat-first app for asynchronous tabletop RPGs, with a few quality-of-life tools to keep play moving. Bring any tabletop RPG: generic play is built in, with optional Shadowdark character stats when useful.
          </p>

          <div className="mt-6 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 text-left shadow-sm">
            <h4 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              Not a VTT
            </h4>
            <p className="mt-2 text-sm sm:text-base text-surface-600 dark:text-surface-400">
              You won&apos;t find battle maps, tactical combat automation, animated dice, or AI-generated content here. Role by Post keeps the conversation flowing while reducing app and tab switching.
            </p>
            <p className="mt-2 text-sm sm:text-base text-surface-600 dark:text-surface-400">
              Instead, each channel links out to its Map and shared Resources (plus a GM-only resources link), and every player can pin a character sheet URL — so your table stays one tap away without leaving the conversation.
            </p>
          </div>
        </section>

        <div className="mt-14">
          <h3 className="text-center text-2xl font-bold text-surface-900 dark:text-surface-100">
            Why Role by Post?
          </h3>
          <p className="mt-2 text-center text-sm text-surface-600 dark:text-surface-400">
            The home for asynchronous tabletop roleplaying
          </p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-950 flex items-center justify-center text-primary-600 dark:text-primary-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    {feature.icon}
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100">{feature.title}</h4>
                  <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/features" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
              See all features →
            </Link>
          </div>
        </div>
      </div>
      <div className="mt-14 text-center text-sm text-surface-600 dark:text-surface-400 space-y-2 flex flex-col items-center">
        <p>
          by{' '}
          <a
            href="https://memorablenaton.es"
            target="_blank"
            rel="noreferrer"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Alvaro Cavalcanti
          </a>
        </p>
        <div className="flex gap-4 text-xs">
          <Link to="/privacy" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            Privacy Policy
          </Link>
          <span className="text-surface-300 dark:text-surface-700">|</span>
          <Link to="/terms" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  )
}
