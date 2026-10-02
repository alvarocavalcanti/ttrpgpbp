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

  // The closing delimiter must be a complete `---` line (optional trailing
  // whitespace), never a line that merely starts with `---`, so a malformed
  // marker leaves the original Markdown untouched instead of corrupting it.
  const afterOpen = raw.slice(3)
  const close = /\n---[ \t]*(\r?\n|$)/.exec(afterOpen)
  if (!close) {
    return { frontmatter: {}, body: raw }
  }

  const fmBlock = afterOpen.slice(0, close.index).trim()
  const body = afterOpen.slice(close.index + close[0].length).trim()

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
