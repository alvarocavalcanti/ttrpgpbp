import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// src/test/setup.ts swaps the `Markdown` export for MarkdownImpl globally, so
// the real (memoized) component is reached through vi.importActual. MarkdownImpl
// itself is mocked to count render passes — if Markdown's memo bails out, the
// lazy impl is never re-rendered.
const { implCalls } = vi.hoisted(() => ({ implCalls: [] as string[] }))
vi.mock('./MarkdownImpl', () => ({
  default: ({ children }: { children: string }) => {
    implCalls.push(children)
    return <div>{children}</div>
  },
}))

describe('Markdown', () => {
  it('bails out of re-renders when props are shallow-equal (memo, #408)', async () => {
    const { Markdown } = await vi.importActual<typeof import('./Markdown')>('./Markdown')

    const { rerender } = render(<Markdown># Hello</Markdown>)
    await screen.findByText('# Hello')
    expect(implCalls).toEqual(['# Hello'])

    // Same props: memo must bail out — no commit, no markdown re-parse.
    rerender(<Markdown># Hello</Markdown>)
    expect(implCalls).toEqual(['# Hello'])

    // Changed content must still render.
    rerender(<Markdown># Goodbye</Markdown>)
    await screen.findByText('# Goodbye')
    expect(implCalls).toEqual(['# Hello', '# Goodbye'])
  })
})
