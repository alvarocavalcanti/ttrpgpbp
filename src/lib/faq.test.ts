import { describe, it, expect } from 'vitest'
import { FAQ_ITEMS } from './faq'
import { faqJsonLd } from './seo'

describe('FAQ_ITEMS', () => {
  it('has at least one unique, populated question and answer', () => {
    expect(FAQ_ITEMS.length).toBeGreaterThan(0)
    expect(new Set(FAQ_ITEMS.map((item) => item.question)).size).toBe(FAQ_ITEMS.length)
    for (const item of FAQ_ITEMS) {
      expect(item.question.length).toBeGreaterThan(0)
      expect(item.answer.length).toBeGreaterThan(0)
      // A literal `</script>` would terminate the injected JSON-LD tag.
      expect(item.answer).not.toContain('</script>')
      expect(item.question).not.toContain('</script>')
    }
  })
})

describe('faqJsonLd', () => {
  it('builds an FAQPage whose questions mirror the visible items', () => {
    const node = faqJsonLd(FAQ_ITEMS)
    expect(node['@context']).toBe('https://schema.org')
    expect(node['@type']).toBe('FAQPage')
    const entities = node.mainEntity as Array<Record<string, unknown>>
    expect(entities).toHaveLength(FAQ_ITEMS.length)
    expect(entities[0]).toMatchObject({
      '@type': 'Question',
      name: FAQ_ITEMS[0].question,
      acceptedAnswer: { '@type': 'Answer', text: FAQ_ITEMS[0].answer },
    })
  })
})
