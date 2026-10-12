import { findAndReplace } from 'mdast-util-find-and-replace'
import type { PhrasingContent, Root } from 'mdast'

// Matches `||spoiler||`. Non-greedy, so `a ||x|| b ||y|| c` yields two
// tokens. findAndReplace only visits text nodes, so `||` inside fenced or
// inline code (code/code value nodes) never matches.
// Known limitation (issue #709): inline Markdown *inside* the delimiters is
// not parsed — `||**bold**||` renders the asterisks literally. The upgrade
// path is a micromark syntax extension; this file stays the only place to
// swap it.
const SPOILER_RE = /\|\|([\s\S]+?)\|\|/g

function toSpoilerNode(content: string): PhrasingContent {
  return {
    type: 'spoiler',
    // mdast-util-to-hast (via remark-rehype, which react-markdown runs)
    // honors data.hName/data.hProperties on unknown node types, producing
    // `<span class="md-spoiler">`. The span override in Markdown.tsx maps
    // that class to the interactive Spoiler component.
    data: { hName: 'span', hProperties: { className: 'md-spoiler' } },
    children: [{ type: 'text', value: content.trim() }],
  } as unknown as PhrasingContent
}

export default function remarkSpoiler() {
  return (tree: Root) => {
    findAndReplace(tree, [SPOILER_RE, (_match: string, content: string) => toSpoilerNode(content)])
  }
}
