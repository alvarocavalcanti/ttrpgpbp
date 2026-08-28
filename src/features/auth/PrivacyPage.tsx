import { Link } from 'react-router-dom'
import { env } from '../../env'

export function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <Link to="/" replace className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Privacy Policy</h1>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 sm:p-8 space-y-8 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">What we collect</h2>
          <p>
            Role by Post uses Google Sign-In (OAuth). When you sign in, we receive your name,
            email address, and profile picture. We store your display name, avatar, and the
            messages, dice rolls, and channel memberships you create in the app.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Where data is stored</h2>
          <p>
            Your data is stored in a Supabase-hosted PostgreSQL database, including the
            authentication records used by Google Sign-In. Push notification subscriptions
            (browser endpoints) are stored so we can deliver notifications you opt into.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Google OAuth scopes</h2>
          <p>
            Sign-in uses the Google OAuth <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">email</code> and{' '}
            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">profile</code> scopes. We do
            not request access to your contacts, calendar, drive, or other Google data. We only use this information to authenticate you and display your name and profile picture inside the application.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Data Sharing &amp; Third Parties</h2>
          <p>
            We do not sell, rent, or trade your personal information to third parties. We do not use your personal information for advertising or marketing. Your information is shared only with the services below, and only for the purposes described:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="font-semibold">Supabase</span> — our hosting and database provider. We store your account and game data here so the app works.
            </li>
            {env.VITE_GA_MEASUREMENT_ID && (
              <li>
                <span className="font-semibold">Google Analytics</span> — anonymous page-view statistics so we understand which screens are used. We track the page address only, never your search terms, messages, or dice rolls.
              </li>
            )}
            {env.VITE_SENTRY_DSN && (
              <li>
                <span className="font-semibold">Sentry</span> — error reports when something goes wrong, used only to find and fix bugs. We also use browser tracing to understand app performance, and may record a screen recording of about 1 in 10 sessions — and of every session where an error occurs — to diagnose problems.
              </li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Google API Limited Use Disclosure</h2>
          <p>
            Role by Post's use and transfer of information received from Google APIs to any other app will adhere to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy#limited-use-requirements"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Your rights</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="font-semibold">Access / portability:</span> use{' '}
              <span className="font-medium">Settings → Account &amp; Data → Download My Data</span>{' '}
              to export your profile, memberships, and authored messages as JSON.
            </li>
            <li>
              <span className="font-semibold">Erasure:</span> use{' '}
              <span className="font-medium">Settings → Account &amp; Data → Delete Account</span>{' '}
              to permanently delete your account and personal data. Your past messages are kept
              anonymously so chat history for other players is preserved.
            </li>
          </ul>
        </section>

        <p className="text-xs text-gray-400 dark:text-gray-400">
          Last updated: August 28, 2026. This policy describes data handling for the Role by Post application. Contact the server
          admin to exercise any of these rights on behalf of an account you cannot access.
        </p>
      </div>
    </div>
  )
}
