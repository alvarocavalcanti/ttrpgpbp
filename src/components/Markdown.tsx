import { lazy, memo, Suspense } from 'react'
import type { Components } from 'react-markdown'

const MarkdownImpl = lazy(() => import('./MarkdownImpl'))

export interface MarkdownProps {
  children: string
  components?: Components
  urlTransform?: (url: string) => string
  // Chat-style line breaks: a single newline renders as <br>. Only enabled on
  // user-authored surfaces (chat, admin messages, channel status).
  breaks?: boolean
  // Spoiler parsing (`||…||`, issue #709). On for every Markdown caller —
  // all of them render user-authored content. HelpPage and ContentPage use
  // MarkdownImpl directly, so author-controlled docs stay literal.
  spoilers?: boolean
}

// Memoized: MessageItem hands `components`/`urlTransform` down on its own
// re-renders, and re-mounting the lazy markdown tree is the hot-path cost we
// are avoiding (#408).
export const Markdown = memo(function Markdown({ spoilers = true, ...rest }: MarkdownProps) {
  return (
    <Suspense fallback={<div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-1/2 rounded my-1"></div>}>
      <MarkdownImpl {...rest} spoilers={spoilers} />
    </Suspense>
  )
})
