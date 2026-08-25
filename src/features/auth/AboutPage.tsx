import { Link } from 'react-router-dom'

export function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <Link to="/" replace className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back
      </Link>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 sm:p-8 text-center">
        <img src="/RoleByPost.png" alt="Role by Post logo" className="w-24 h-24 rounded mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">About Role by Post</h1>
        <p className="mt-3 text-gray-600 dark:text-gray-400">
          by{' '}
          <a
            href="https://memorablenaton.es"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Alvaro Cavalcanti
          </a>
        </p>

        <div className="mt-8 flex flex-wrap justify-center items-center gap-4">
          <a
            href="https://www.buymeacoffee.com/alvarocavalcanti"
            target="_blank"
            rel="noreferrer"
          >
            <img
              height="36"
              src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
              alt="Buy Me A Coffee"
              className="h-9"
            />
          </a>
          <a href="https://ko-fi.com/O4O1WSP5B" target="_blank" rel="noreferrer">
            <img
              height="36"
              src="https://storage.ko-fi.com/cdn/kofi6.png?v=6"
              alt="Buy Me a Coffee at ko-fi.com"
              className="h-9"
            />
          </a>
        </div>

        <a
          href="https://github.com/alvarocavalcanti/ttrpgpbp"
          target="_blank"
          rel="noreferrer"
          className="inline-flex mt-8 text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Role by Post on GitHub
        </a>
      </div>
    </div>
  )
}
