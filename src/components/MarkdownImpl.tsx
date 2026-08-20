import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

export interface MarkdownImplProps {
  children: string
  components?: Components
  urlTransform?: (url: string) => string
}

export default function MarkdownImpl({ children, components, urlTransform }: MarkdownImplProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
      {children}
    </ReactMarkdown>
  )
}
