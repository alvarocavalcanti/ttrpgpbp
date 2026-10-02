import { Link } from 'react-router-dom'
import { ThemeToggle } from '../../components/ThemeToggle'

// Slim header for signed-out visitors on public content and help pages
// (issue #644). Signed-in users already get the app header, so pages render
// this only when there is no user.
export function MarketingHeader() {
  return (
    <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 max-w-3xl mx-auto w-full">
      <Link to="/" className="flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-surface-100">
        <img src="/RoleByPost.png" alt="" width={32} height={32} className="w-8 h-8 rounded" />
        Role by Post
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          to="/login"
          className="inline-flex items-center min-h-11 px-4 py-2 text-sm font-medium rounded-md text-primary-700 dark:text-primary-300 hover:bg-surface-100 dark:hover:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          Sign in
        </Link>
      </div>
    </header>
  )
}
