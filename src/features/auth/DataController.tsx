import { env } from '../../env'

// Data-controller identity (GDPR Art 13, #562): the name and contact email
// come from build-time env vars so each deployment names its own controller.
// Unset vars render a generic line with no contact email.
//
// Text is built as single string nodes on purpose: browser-prerendered pages
// hydrate, and two adjacent text nodes merge when the HTML is re-parsed into
// the DOM, which React reports as a hydration mismatch (#418). See issue #643.
export function DataControllerLine() {
  const name = env.VITE_CONTROLLER_NAME || 'the operator of this Role by Post instance'
  const email = env.VITE_CONTROLLER_EMAIL
  if (!email) {
    return <>{`The data controller is ${name}.`}</>
  }
  return (
    <>
      {`The data controller is ${name} — contact `}
      <a
        href={`mailto:${email}`}
        className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
      >
        {email}
      </a>
      {'.'}
    </>
  )
}
