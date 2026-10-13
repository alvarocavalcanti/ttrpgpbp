import type { Parent, PhrasingContent, Root, Text } from 'mdast'

// Matches Discord-style `||spoiler||` delimiters.
const DELIM = '||'

function textNode(value: string): Text {
  return { type: 'text', value }
}

function spoilerNode(children: PhrasingContent[]): PhrasingContent {
  return {
    type: 'spoiler',
    // mdast-util-to-hast (via remark-rehype, which react-markdown runs)
    // honors data.hName/data.hProperties on unknown node types, producing
    // `<span class="md-spoiler">`. The span override in MarkdownImpl maps
    // that class to the interactive Spoiler component.
    data: { hName: 'span', hProperties: { className: 'md-spoiler' } },
    children,
  } as unknown as PhrasingContent
}

function isText(node: PhrasingContent): node is Text {
  return node.type === 'text'
}

// Pairs `||…||` across sibling inline nodes. By the time this transformer
// runs, remark has already tokenized the line: `||**bold**||` arrives as
// text/strong/text, and `||roll 1d20||` arrives as text/link/text because
// MessageItem's linkifyDice runs before parsing. A text-node-only
// replacement sees neither shape and would leak the secret plus delimiters,
// so the opener and closer are matched across the whole sibling run and
// everything between them — dice chips, emphasis, mention links — hides
// inside the spoiler. Code spans/blocks are value nodes, never text, so
// `||` inside code stays literal. Pairing never crosses into a new sibling
// run (no multi-paragraph spoilers), and `||` does not mix with GFM tables
// (pipes delimit cells before this runs).
function pairInSiblings(nodes: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = []
  let i = 0
  while (i < nodes.length) {
    const node = nodes[i]
    i++
    if (!isText(node)) {
      out.push(node)
      continue
    }
    let rest = node.value
    while (rest !== '') {
      const openAt = rest.indexOf(DELIM)
      if (openAt === -1) {
        out.push(textNode(rest))
        break
      }
      const closeAt = rest.indexOf(DELIM, openAt + 2)
      if (closeAt !== -1) {
        const inner = rest.slice(openAt + 2, closeAt)
        if (inner) {
          if (openAt > 0) out.push(textNode(rest.slice(0, openAt)))
          out.push(spoilerNode([textNode(inner.trim())]))
        } else {
          // `||||`: no content, stays literal.
          out.push(textNode(rest.slice(0, closeAt + 2)))
        }
        rest = rest.slice(closeAt + 2)
        continue
      }
      // Opener with no closer left in this node: scan following siblings.
      const before = rest.slice(0, openAt)
      const firstInner = rest.slice(openAt + 2)
      const captured: PhrasingContent[] = []
      if (firstInner) captured.push(textNode(firstInner))
      const scanFrom = i
      let after = ''
      let closed = false
      while (i < nodes.length) {
        const sib = nodes[i]
        if (isText(sib)) {
          const endAt = sib.value.indexOf(DELIM)
          if (endAt !== -1) {
            const tail = sib.value.slice(0, endAt)
            if (tail) captured.push(textNode(tail))
            after = sib.value.slice(endAt + 2)
            closed = true
            i++
            break
          }
        }
        captured.push(sib)
        i++
      }
      if (!closed) {
        // No closer anywhere ahead: restore the scan so the outer loop emits
        // the siblings unchanged, and the opener stays literal. Without the
        // restore, the consumed siblings would be silently dropped.
        i = scanFrom
        out.push(textNode(rest))
        break
      }
      if (before) out.push(textNode(before))
      out.push(spoilerNode(captured))
      rest = after
    }
  }
  return out
}

function pairDeep(node: Parent): void {
  const paired = pairInSiblings(node.children as unknown as PhrasingContent[])
  node.children = paired as unknown as Parent['children']
  for (const child of paired) {
    if (Array.isArray((child as Parent).children)) pairDeep(child as unknown as Parent)
  }
}

export default function remarkSpoiler() {
  return (tree: Root) => {
    pairDeep(tree)
  }
}
