import { env } from '../../env'

// Data-controller identity (GDPR Art 13, #562): the name and contact email
// come from build-time env vars so each deployment names its own controller.
// Unset vars render a generic line with no contact email.
export function DataControllerLine() {
  const name = env.VITE_CONTROLLER_NAME || 'the operator of this Role by Post instance'
  return (
    <>
      The data controller is {name}
      {env.VITE_CONTROLLER_EMAIL ? (
        <>
          {' '}— contact{' '}
          <a
            href={`mailto:${env.VITE_CONTROLLER_EMAIL}`}
            className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            {env.VITE_CONTROLLER_EMAIL}
          </a>
          .
        </>
      ) : (
        '.'
      )}
    </>
  )
}
