// Replaces spoiler content (`||…||`, issue #709) with `(spoiler)` outside
// code spans/blocks. The chat renderer parses code first, so a `||` inside
// code must never pair with a spoiler delimiter — the split below is the
// same one linkifyDice uses. `dangling` also scrubs an unterminated opener
// (DB-truncated previews, lock-screen bodies); reply quotes pass full text,
// where an unterminated `||` renders literally, so they leave it alone.
export function scrubSpoilers(text: string, dangling: boolean): string {
  const scrub = (part: string): string => {
    const paired = part.replace(/\|\|[\s\S]*?\|\|/g, '(spoiler)')
    return dangling ? paired.replace(/\|\|[\s\S]*$/, '(spoiler)') : paired
  }
  return text
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((part, i) => (i % 2 === 0 ? scrub(part) : part))
    .join('')
}
