import { lazy, memo, Suspense } from 'react'
import type { Components } from 'react-markdown'

const MarkdownImpl = lazy(() => import('./MarkdownImpl'))

export interface MarkdownProps {
  children: string
  components?: Components
  urlTransform?: (url: string) => string
}

// Memoized: MessageItem hands `components`/`urlTransform` down on its own
// re-renders, and re-mounting the lazy markdown tree is the hot-path cost we
// are avoiding (#408).
export const Markdown = memo(function Markdown(props: MarkdownProps) {
  return (
    <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-1/2 rounded my-1"></div>}>
      <MarkdownImpl {...props} />
    </Suspense>
  )
})
