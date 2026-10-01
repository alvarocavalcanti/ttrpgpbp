// Pure SEO text builders shared by the build scripts (scripts/seo/) and the
// Seo React component. No React and no `import.meta`, so Node 26 can import
// this file directly when the scripts run.

export interface SitemapRoute {
  path: string
  changeFrequency?: string
  priority?: number
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function trimBase(siteUrl: string): string {
  return siteUrl.replace(/\/$/, '')
}

export function canonicalUrl(siteUrl: string, path: string): string {
  const base = trimBase(siteUrl)
  return path === '/' ? `${base}/` : `${base}${path}`
}

export function buildSitemap(routes: SitemapRoute[], siteUrl: string, lastmod: string): string {
  const urls = routes.map((route) => {
    const lines = [`    <loc>${escapeXml(canonicalUrl(siteUrl, route.path))}</loc>`]
    if (lastmod) lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`)
    if (route.changeFrequency) lines.push(`    <changefreq>${route.changeFrequency}</changefreq>`)
    if (typeof route.priority === 'number') {
      lines.push(`    <priority>${route.priority.toFixed(1)}</priority>`)
    }
    return `  <url>\n${lines.join('\n')}\n  </url>`
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

export function buildRobots(siteUrl: string, disallow: string[]): string {
  const lines = ['User-agent: *', 'Allow: /']
  for (const path of disallow) lines.push(`Disallow: ${path}`)
  lines.push('', `Sitemap: ${canonicalUrl(siteUrl, '/sitemap.xml')}`, '')
  return lines.join('\n')
}

// Schema.org JSON-LD for the landing page. `SoftwareApplication` is declared
// free (the app has no paid tier).
export function siteJsonLd(siteUrl: string): Record<string, unknown>[] {
  const base = trimBase(siteUrl)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Role by Post',
      url: `${base}/`,
      logo: `${base}/pwa-512x512.png`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Role by Post',
      url: `${base}/`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Role by Post',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      url: `${base}/`,
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ]
}
