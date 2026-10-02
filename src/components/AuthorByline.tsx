import { Link } from 'react-router-dom'
import { AUTHOR } from '../lib/author'

// EEAT byline for the public guides (issue #645): a visible author credit that
// links to the About page, paired with the Article/HowTo `author` schema.
export function AuthorByline() {
  return (
    <p className="mt-10 border-t border-surface-200 pt-4 text-sm text-surface-500 dark:border-surface-700 dark:text-surface-400">
      {/* Single text expressions around the link: adjacent JSX text nodes merge
          when the browser parses the prerendered HTML, which throws React #418
          on hydration. */}
      {'Written by '}
      <Link to="/about" className="text-primary-600 hover:underline dark:text-primary-400">
        {AUTHOR.name}
      </Link>
      {', creator of Role by Post.'}
    </p>
  )
}
