import { Link, Navigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getGeneralHelp } from './helpContent'

export function HelpPage() {
  const { topic } = useParams<{ topic: string }>()
  const entries = getGeneralHelp()

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">No help topics available yet.</p>
      </div>
    )
  }

  const active = entries.find((e) => e.slug === topic) ?? entries[0]

  if (topic && !entries.some((e) => e.slug === topic)) {
    return <Navigate to="/help" replace />
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row bg-gray-50 dark:bg-gray-900">
      {/* Topic list */}
      <nav className="lg:w-64 lg:shrink-0 bg-white dark:bg-gray-800 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 overflow-x-auto lg:overflow-y-auto">
        <h2 className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-100 dark:border-gray-800">
          Help Topics
        </h2>
        <ul className="flex lg:flex-col gap-1 p-2 lg:p-2">
          {entries.map((entry) => (
            <li key={entry.slug} className="shrink-0">
              <Link
                to={`/help/${entry.slug}`}
                className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                  entry.slug === active.slug
                    ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <article className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{active.title}</h1>
          {active.screenshot && (
            <img
              src={active.screenshot}
              alt={`${active.title} screenshot`}
              className="w-full max-w-xl mb-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
            />
          )}
          <div className="prose prose-sm sm:prose-base max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{active.content}</ReactMarkdown>
          </div>
        </article>
      </main>
    </div>
  )
}
