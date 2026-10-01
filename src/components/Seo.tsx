// Per-route document metadata for the public pages (issue #643). Uses React
// 19's native hoisting: `<title>`, `<meta>`, and `<link>` rendered anywhere in
// the tree are moved into `<head>`. The prerender script bakes the result into
// each route's static HTML.
//
// ponytail: no react-helmet — React 19 hoists these natively. Title and
// description default to PUBLIC_ROUTES so the strings live in one place.
import { PUBLIC_ROUTES } from '../lib/publicRoutes'
import { canonicalUrl } from '../lib/seo'

interface SeoProps {
  /** Route path used for the canonical URL, e.g. `/features`. */
  path: string
  title?: string
  description?: string
  /** Absolute image path under the site root; defaults to the OG image. */
  image?: string
  type?: 'website' | 'article'
  noindex?: boolean
  jsonLd?: Record<string, unknown>[]
}

export function Seo({
  path,
  title,
  description,
  image = '/og-image.png',
  type = 'website',
  noindex = false,
  jsonLd,
}: SeoProps) {
  const route = PUBLIC_ROUTES.find((entry) => entry.path === path)
  const resolvedTitle = title ?? route?.title ?? 'Role by Post'
  const resolvedDescription =
    description ?? route?.description ?? 'A chat-first app for asynchronous tabletop RPGs.'
  const siteUrl = __SITE_URL__.replace(/\/$/, '')
  const url = canonicalUrl(siteUrl, path)
  const imageUrl = canonicalUrl(siteUrl, image)

  return (
    <>
      <title>{resolvedTitle}</title>
      <meta name="description" content={resolvedDescription} />
      {!noindex && <link rel="canonical" href={url} />}
      {noindex && <meta name="robots" content="noindex" />}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Role by Post" />
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={imageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={imageUrl} />
      {jsonLd?.map((node, index) => (
        <script
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}
    </>
  )
}
