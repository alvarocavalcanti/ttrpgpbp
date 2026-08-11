export interface HelpEntry {
  slug: string
  title: string
  content: string
  screenshot?: string
}

interface RawFrontmatter {
  title?: string
  screenshot?: string
}

const generalModules = import.meta.glob('/docs/help/general/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const channelModules = import.meta.glob('/docs/help/channel/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

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

function buildEntries(modules: Record<string, string>): HelpEntry[] {
  return Object.entries(modules)
    .map(([path, raw]) => {
      const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? ''
      const { frontmatter, body } = parseFrontmatter(raw)
      const entry: HelpEntry = {
        slug,
        title: frontmatter.title ?? slug,
        content: body,
      }
      if (frontmatter.screenshot) entry.screenshot = frontmatter.screenshot
      return entry
    })
    .sort((a, b) => a.title.localeCompare(b.title))
}

export function getGeneralHelp(): HelpEntry[] {
  return buildEntries(generalModules)
}

export function getChannelHelp(): HelpEntry[] {
  return buildEntries(channelModules)
}
