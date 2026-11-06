import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSlug from 'rehype-slug'
import type { ComponentProps } from 'react'
import type { Components } from 'react-markdown'
import remarkSpoiler from '../lib/remarkSpoiler'
import { Spoiler } from './Spoiler'

export interface MarkdownImplProps {
  children: string
  components?: Components
  urlTransform?: (url: string) => string
  // Chat-style line breaks: a single newline renders as <br>. Only enabled on
  // user-authored surfaces (chat, admin messages, channel status) — help and
  // marketing markdown keeps standard CommonMark semantics.
  breaks?: boolean
  // Spoiler parsing (`||…||`, issue #709). Opt-in and off by default so the
  // direct MarkdownImpl callers (HelpPage, ContentPage) keep literal
  // semantics for author-controlled docs; the Markdown wrapper turns it on.
  spoilers?: boolean
  // Adds stable heading ids (`## Reporting a message` → `reporting-a-message`)
  // so help pages can be deep-linked. Opt-in: chat and marketing markdown keep
  // their current DOM.
  headingIds?: boolean
}

type SpanProps = ComponentProps<'span'> & { node?: unknown }

// Maps remarkSpoiler's `md-spoiler` spans to the interactive Spoiler
// component. No caller passes its own `span` renderer today; if one ever
// does, compose it here instead of overwriting. Exported for a direct unit
// test: no markdown construct emits a bare span, so the fallback path is
// only reachable head-on.
export function SpoilerSpan({ node: _node, className, children, ...rest }: SpanProps) {
  if (typeof className === 'string' && className.includes('md-spoiler')) return <Spoiler>{children}</Spoiler>
  return <span className={className} {...rest}>{children}</span>
}

export default function MarkdownImpl({ children, components, urlTransform, breaks, spoilers, headingIds }: MarkdownImplProps) {
  const plugins = [remarkGfm, ...(spoilers ? [remarkSpoiler] : []), ...(breaks ? [remarkBreaks] : [])]
  return (
    <ReactMarkdown
      remarkPlugins={plugins}
      rehypePlugins={headingIds ? [rehypeSlug] : undefined}
      components={spoilers ? { ...components, span: SpoilerSpan } : components}
      urlTransform={urlTransform}
    >
      {children}
    </ReactMarkdown>
  )
}
