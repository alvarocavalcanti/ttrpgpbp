import { lazy, Suspense } from 'react'

const MarkdownImpl = lazy(() => import('./MarkdownImpl'))

export interface MarkdownProps {
  children: string
  components?: any
  urlTransform?: (url: string) => string
}

export function Markdown(props: MarkdownProps) {
  return (
    <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-1/2 rounded my-1"></div>}>
      <MarkdownImpl {...props} />
    </Suspense>
  )
}
