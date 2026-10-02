// Frontmatter parser shared by the help and long-form content loaders (and
// usable from the SEO build scripts). Kept free of React and `import.meta`.

interface RawFrontmatter {
  title?: string
  screenshot?: string
}

export function parseFrontmatter(raw: string): { frontmatter: RawFrontmatter; body: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, body: raw }
  }

  const endIndex = raw.indexOf('\n---', 3)
  if (endIndex === -1) {
    return { frontmatter: {}, body: raw }
  }

  const fmBlock = raw.slice(3, endIndex).trim()
  const body = raw.slice(endIndex + 4).trim()

  const frontmatter: RawFrontmatter = {}
  for (const line of fmBlock.split('\n')) {
    const [key, ...rest] = line.split(':')
    if (!key) continue
    const value = rest.join(':').trim()
    if (key === 'title') frontmatter.title = value
    if (key === 'screenshot') frontmatter.screenshot = value
  }

  return { frontmatter, body }
}
