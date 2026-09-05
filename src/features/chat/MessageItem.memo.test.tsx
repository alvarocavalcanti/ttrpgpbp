import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Render counter: MessageItem's body always renders <Markdown> for a regular
// message, so counting Markdown invocations counts MessageItem render passes.
// (A Profiler-based counter is useless here: React 19 fires Profiler.onRender
// even when a memoized subtree bails out.) This file-local mock overrides the
// global MarkdownImpl swap from src/test/setup.ts.
const { markdownCalls } = vi.hoisted(() => ({ markdownCalls: [] as string[] }))
vi.mock('../../components/Markdown', () => ({
  Markdown: ({ children }: { children: string }) => {
    markdownCalls.push(children)
    return <div data-testid="md">{children}</div>
  },
}))

import { MessageItem } from './MessageItem'

const makeMsg = (id: string, content: string): any => ({
  id,
  type: 'regular',
  content,
  created_at: new Date().toISOString(),
  sender_id: 'u1',
})

const times = (content: string) => markdownCalls.filter(c => c.includes(content)).length

function Harness({ items, callbacks }: {
  items: any[]
  callbacks: { onEdit: any, onDelete: any, onRollDice: any, onRetry: any }
}) {
  return (
    <>
      {items.map(m => (
        <MessageItem
          key={m.id}
          message={m}
          currentUserId="u1"
          isGM={false}
          onEdit={callbacks.onEdit}
          onDelete={callbacks.onDelete}
          onRollDice={callbacks.onRollDice}
          onRetry={callbacks.onRetry}
        />
      ))}
    </>
  )
}

describe('MessageItem memoization (issue #408)', () => {
  it('does not re-render items whose props are shallow-equal across parent rerenders', () => {
    markdownCalls.length = 0
    const callbacks = { onEdit: vi.fn(), onDelete: vi.fn(), onRollDice: vi.fn(), onRetry: vi.fn() }
    const messages = [makeMsg('m1', 'first'), makeMsg('m2', 'second'), makeMsg('m3', 'third')]

    const { rerender } = render(<Harness items={messages} callbacks={callbacks} />)
    expect(times('first')).toBe(1)
    expect(times('second')).toBe(1)
    expect(times('third')).toBe(1)

    // Parent rerender, identical props: memo must bail out on every item.
    rerender(<Harness items={messages} callbacks={callbacks} />)
    expect(times('first')).toBe(1)
    expect(times('second')).toBe(1)
    expect(times('third')).toBe(1)

    // Only the message that actually changed re-renders.
    const nextMessages = [messages[0], { ...messages[1], content: 'second (edited)' }, messages[2]]
    rerender(<Harness items={nextMessages} callbacks={callbacks} />)
    expect(times('first')).toBe(1)
    expect(times('second (edited)')).toBe(1)
    expect(times('third')).toBe(1)
  })

  it('re-renders every item when a callback prop changes identity (memo is live)', () => {
    markdownCalls.length = 0
    const callbacksA = { onEdit: vi.fn(), onDelete: vi.fn(), onRollDice: vi.fn(), onRetry: vi.fn() }
    const messages = [makeMsg('m1', 'first'), makeMsg('m2', 'second')]

    const { rerender } = render(<Harness items={messages} callbacks={callbacksA} />)
    expect(times('first')).toBe(1)
    expect(times('second')).toBe(1)

    // New callback identities (what unstable parent callbacks caused before
    // the fix) must still be honored — memo bails only on equal props.
    const callbacksB = { onEdit: vi.fn(), onDelete: vi.fn(), onRollDice: vi.fn(), onRetry: vi.fn() }
    rerender(<Harness items={messages} callbacks={callbacksB} />)
    expect(times('first')).toBe(2)
    expect(times('second')).toBe(2)
  })
})
