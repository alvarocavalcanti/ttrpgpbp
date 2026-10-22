import { Fragment } from 'react'
import { splitLinks } from '../lib/linkify'

// Renders GM-authored listing copy with its http(s) links tappable. Callers keep
// their own wrapper (`<p>`, `<dd>`) so line clamping and `whitespace-pre-wrap`
// keep working; the link carries `nofollow ugc` because the public directory is
// indexable and the copy is author-controlled.
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, index) =>
        part.href ? (
          <a
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="break-words text-primary-600 underline underline-offset-2 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
