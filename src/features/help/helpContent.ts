import { parseFrontmatter } from '../../lib/helpFrontmatter'

export { parseFrontmatter }

export interface HelpEntry {
  slug: string
  title: string
  content: string
  screenshot?: string
}

const generalModules = import.meta.glob('/docs/help/general/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const channelModules = import.meta.glob('/docs/help/channel/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

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
