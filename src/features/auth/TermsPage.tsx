import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <Link to="/" className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Terms of Service</h1>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 sm:p-8 space-y-8 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">1. Acceptance of Terms</h2>
          <p>
            By accessing or using RoleByPost, you agree to be bound by these Terms of Service.
            If you do not agree to all of the terms and conditions, you may not access or use the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">2. Description of Service</h2>
          <p>
            RoleByPost is a web-based, text-first tabletop roleplaying game (TTRPG) play-by-post platform.
            It provides features including real-time chat, server-authoritative dice rolling, campaign management,
            and push notifications.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">3. User Accounts</h2>
          <p>
            You must sign in using a Google account to access RoleByPost. You are responsible for maintaining the
            security of your account and for all activities that occur under your account. You must notify the administrator
            immediately of any unauthorized use of your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">4. User Content</h2>
          <p>
            You retain ownership of any content you submit, post, or display on or through the service, including messages,
            NPC profiles, images, and character sheets. By submitting content, you grant RoleByPost a worldwide, non-exclusive,
            royalty-free license to host, store, reproduce, and display such content solely for the purpose of operating,
            developing, and providing the service to you and other channel members.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">5. Prohibited Conduct</h2>
          <p>
            You agree not to use the service for any unlawful purpose or in any way that violates these Terms. Prohibited
            conduct includes, but is not limited to: harassing or abusing other players, posting sexually explicit or illegal content,
            attempting to disrupt the service, and fabricating dice rolls or cheating via client manipulation. The server
            administrator reserves the right to suspend or delete accounts that engage in prohibited conduct.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">6. Termination</h2>
          <p>
            You may terminate your account at any time via Settings. The server administrator may also terminate or suspend
            access to our service immediately, without prior notice or liability, for any reason whatsoever, including without
            limitation if you breach the Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">7. Disclaimer of Warranties</h2>
          <p>
            RoleByPost is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. We disclaim all warranties of any
            kind, whether express or implied, including but not limited to the implied warranties of merchantability, fitness
            for a particular purpose, and non-infringement. We do not warrant that the service will be uninterrupted, timely,
            secure, or error-free.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">8. Limitation of Liability</h2>
          <p>
            In no event shall RoleByPost, its creator, or its administrators be liable for any indirect, incidental, special,
            consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other
            intangible losses, resulting from your access to or use of or inability to access or use the service.
          </p>
        </section>

        <p className="text-xs text-gray-400 dark:text-gray-400">
          Last updated: August 20, 2026. For questions regarding these Terms, contact the server administrator.
        </p>
      </div>
    </div>
  )
}
