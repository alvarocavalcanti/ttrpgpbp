import { AUTHOR } from '../lib/author'

// EEAT byline for the public guides (issue #645): a visible author credit
// paired with the Article/HowTo `author` schema. Links to the author's public
// site — the app's own /about is behind the auth gate, so it would bounce
// signed-out readers to /login (Copilot #660).
export function AuthorByline() {
  return (
    <p className="mt-10 border-t border-surface-200 pt-4 text-sm text-surface-500 dark:border-surface-700 dark:text-surface-400">
      {/* Single text expressions around the link: adjacent JSX text nodes merge
          when the browser parses the prerendered HTML, which throws React #418
          on hydration. */}
      {'Written by '}
      <a
        href={AUTHOR.url}
        target="_blank"
        rel="noreferrer"
        className="text-primary-600 hover:underline dark:text-primary-400"
      >
        {AUTHOR.name}
      </a>
      {', creator of Role by Post.'}
    </p>
  )
}
