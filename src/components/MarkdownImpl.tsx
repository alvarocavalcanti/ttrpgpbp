import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { Components } from 'react-markdown'

export interface MarkdownImplProps {
  children: string
  components?: Components
  urlTransform?: (url: string) => string
  // Chat-style line breaks: a single newline renders as <br>. Only enabled on
  // user-authored surfaces (chat, admin messages, channel status) — help and
  // marketing markdown keeps standard CommonMark semantics.
  breaks?: boolean
}

export default function MarkdownImpl({ children, components, urlTransform, breaks }: MarkdownImplProps) {
  return (
    <ReactMarkdown remarkPlugins={breaks ? [remarkGfm, remarkBreaks] : [remarkGfm]} components={components} urlTransform={urlTransform}>
      {children}
    </ReactMarkdown>
  )
}
