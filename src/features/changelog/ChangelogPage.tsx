import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getChangelogMarkdown } from './changelog'

export function ChangelogPage() {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <article className="max-w-3xl mx-auto">
        <div className="prose prose-sm sm:prose-base max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{getChangelogMarkdown()}</ReactMarkdown>
        </div>
      </article>
    </div>
  )
}
