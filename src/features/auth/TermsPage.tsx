import { Link } from 'react-router-dom'
import { DataControllerLine } from './DataController'

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <Link to="/" replace className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6">
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
            By accessing or using Role by Post, you agree to be bound by these Terms of Service.
            If you do not agree to all of the terms and conditions, you may not access or use the service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">2. Description of Service</h2>
          <p>
            Role by Post is a web-based, text-first tabletop roleplaying game (TTRPG) play-by-post platform.
            It provides features including real-time chat, server-authoritative dice rolling, campaign management,
            and push notifications.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">3. User Accounts</h2>
          <p>
            You must sign in using a Google account to access Role by Post. You are responsible for maintaining the
            security of your account and for all activities that occur under your account. You must notify the administrator
            immediately of any unauthorized use of your account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">4. User Content</h2>
          <p>
            You retain ownership of any content you submit, post, or display on or through the service, including messages,
            NPC profiles, images, and character sheets. By submitting content, you grant Role by Post a worldwide, non-exclusive,
            royalty-free license to host, store, reproduce, and display such content solely for the purpose of operating,
            developing, and providing the service to you and other channel members.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">5. Acceptable Use &amp; Prohibited Conduct</h2>
          <p>
            Role by Post is provided for tabletop roleplaying games and personal storytelling. By using the service,
            you agree not to use it for any unlawful purpose or in any manner inconsistent with this policy. Prohibited
            conduct includes, but is not limited to:
          </p>
          <p>
            <strong>Illegal content &amp; activity.</strong> You may not post, share, solicit, or link to content that is
            illegal, or use the service to plan, promote, or coordinate any unlawful act — including but not limited to:
            child sexual abuse material (CSAM) or any sexualized depiction of a minor; human trafficking; the sale or
            distribution of illegal drugs, weapons, or stolen goods; fraud; and conspiracy or coordination to commit any crime.
          </p>
          <p>
            <strong>Illicit imagery.</strong> You may not upload, post, or link to any image or file containing illegal or
            abusive content, including CSAM, non-consensual intimate imagery, or content that exploits or endangers minors.
          </p>
          <p>
            <strong>Harassment &amp; abuse.</strong> You may not harass, threaten, stalk, dox (publish another person&apos;s
            private information), or incite violence or self-harm against any person.
          </p>
          <p>
            <strong>Sexual content.</strong> You may not post sexual content involving minors under any circumstances. You
            may not post sexually explicit adult content.
          </p>
          <p>
            <strong>Non-gaming misuse.</strong> You may not repurpose the platform for conduct unrelated to its stated
            purpose, including bulk messaging, spam, phishing, malware distribution, or operating commercial services.
          </p>
          <p>
            <strong>Platform integrity.</strong> You may not attempt to disrupt, reverse-engineer, or gain unauthorized
            access to the service, or fabricate dice rolls or cheat via client manipulation.
          </p>
          <p>
            We reserve the right — but not the obligation — to monitor content, remove content that violates this policy,
            and suspend or terminate accounts that engage in prohibited conduct. We may report unlawful content or conduct
            to the appropriate authorities. Failure to enforce this policy in any instance does not waive our right to
            enforce it later.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">6. Data Security, Monitoring &amp; Encryption Disclosure</h2>
          <p>
            Messages and files on Role by Post are <strong>not end-to-end encrypted.</strong> While data is encrypted
            in transit (over the network) and at rest (on our hosting provider&apos;s infrastructure), messages are stored
            in a form readable by Role by Post. Our system administrators and automated safety systems can access and review
            content on the service for the purposes described in these Terms and our Privacy Policy — including investigating
            reports, enforcing this Acceptable Use Policy, detecting unlawful or abusive content, and responding to lawful
            requests from authorities.
          </p>
          <p>
            Do not use Role by Post to transmit information you would not want a system administrator to be able to read.
            By using the service, you acknowledge and consent to this monitoring and access.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">7. Safety Reporting &amp; Law Enforcement Cooperation</h2>
          <p>
            <strong>Reporting unlawful content.</strong> If we become aware of content that appears to involve child sexual
            abuse material or the exploitation of minors, we will report it to the appropriate authorities — which may include
            the National Center for Missing &amp; Exploited Children (NCMEC) in the United States, an INHOPE-member hotline
            such as Hotline.ie in Ireland, or equivalent authorities in your country of residence. We may also report other
            unlawful content or activity to law enforcement when we reasonably believe the law requires or permits it.
          </p>
          <p>
            <strong>Responding to lawful requests.</strong> We may disclose account information, message content, and other
            records to law enforcement, regulators, or other third parties when we have a good-faith belief that disclosure is
            necessary to: comply with a valid legal process (subpoena, court order, or warrant); protect the rights, safety, or
            vital interests of any person; prevent or address unlawful activity; or otherwise comply with applicable law
            (including, under the GDPR, Article 6(1)(c) legal obligation and Article 6(1)(f) legitimate interests).
          </p>
          <p>
            <strong>No obligation to notify.</strong> To the extent permitted by law, we may disclose information to authorities
            without prior notice to you, including where disclosure could compromise an investigation.
          </p>
          <p>
            <strong>User reporting.</strong> You can report abusive content or behavior through the in-app reporting feature.
            We review reports in good faith but do not guarantee a response within any specific timeframe.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">8. User Responsibility &amp; Indemnification</h2>
          <p>
            You are solely responsible for the content you post, share, or transmit through the service, and for the
            consequences of doing so. You represent that you have all rights necessary to submit your content and that your
            content does not violate these Terms or any applicable law.
          </p>
          <p>
            To the fullest extent permitted by law, you agree to indemnify, defend, and hold harmless Role by Post, its creator,
            and its administrators from and against any and all claims, damages, losses, liabilities, costs, and expenses
            (including reasonable legal fees) arising out of or related to: (a) your use of the service; (b) your content;
            (c) your violation of these Terms or applicable law; or (d) your violation of any third-party right, including any
            dispute between you and another user.
          </p>
          <p>
            Role by Post is not a party to, and is not responsible for, disputes between users. To the extent permitted by law,
            in the United States Role by Post relies on Section 230 of the Communications Decency Act and other applicable
            intermediary protections with respect to user-generated content.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">9. Communications</h2>
          <p>
            In-app messages (announcements and direct messages with the server administrator) are part
            of the service and do not require additional consent. We will only send you email if you opt
            in to email updates in Settings; you can opt out at any time there. Account and security
            notices may be sent to your email without consent. Email addresses are never shared or sold.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">10. Termination</h2>
          <p>
            You may terminate your account at any time via Settings. The server administrator may also terminate or suspend
            access to our service immediately, without prior notice or liability, for any reason whatsoever, including without
            limitation if you breach the Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">11. Disclaimer of Warranties</h2>
          <p>
            Role by Post is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. We disclaim all warranties of any
            kind, whether express or implied, including but not limited to the implied warranties of merchantability, fitness
            for a particular purpose, and non-infringement. We do not warrant that the service will be uninterrupted, timely,
            secure, or error-free.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">12. Limitation of Liability</h2>
          <p>
            In no event shall Role by Post, its creator, or its administrators be liable for any indirect, incidental, special,
            consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other
            intangible losses, resulting from your access to or use of or inability to access or use the service.
          </p>
          <p>
            Role by Post does not control, endorse, or assume responsibility for content posted by users. We are not liable for
            any user-generated content, or for any conduct of any user, whether on or off the service. This limitation applies
            to user-to-user misconduct, including harassment, fraud, and the sharing of unlawful content by third parties.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">13. Eligibility</h2>
          <p>
            You must be at least 16 years of age to use Role by Post. If you are under 16, you may not create an account or
            use the service. If you are a resident of a country that requires a higher minimum age or parental consent (for
            example, Brazil, where parental consent may be required for users under 18), you must meet that higher requirement.
            We rely on your confirmation that you meet the minimum age: we do not verify age and do not collect a date of birth.
            If we learn that an account belongs to someone below the applicable minimum age, we will close the account and
            delete the personal information associated with it.
          </p>
        </section>

        <p className="text-xs text-gray-400 dark:text-gray-400">
          Last updated: September 21, 2026. For questions regarding these Terms, contact the server administrator. <DataControllerLine />
        </p>
      </div>
    </div>
  )
}
