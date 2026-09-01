import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MessageList } from './MessageList'
import { useAuth } from '../auth/useAuth'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('./MessageItem', () => ({
  MessageItem: ({ message }: any) => <div data-testid="msg-item">{message.content}</div>
}))

describe('MessageList', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders empty state', () => {
    render(<MessageList messages={[]} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('No messages yet. Say hello!')).toBeInTheDocument()
  })

  it('shows an error state instead of the empty state when loading failed', () => {
    render(
      <MessageList
        messages={[]}
        isGM={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        error={new Error('Failed to fetch messages')}
      />
    )
    expect(screen.getByText(/Could not load messages/)).toBeInTheDocument()
    expect(screen.queryByText('No messages yet. Say hello!')).not.toBeInTheDocument()
  })

  it('renders a load-older button when hasMore is set and calls the handler', () => {
    const onLoadOlder = vi.fn()
    const msgs: any = [{ id: '1', content: 'Msg 1', created_at: '2023-01-01T10:00:00Z' }]
    render(
      <MessageList
        messages={msgs}
        isGM={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        hasMore
        onLoadOlder={onLoadOlder}
      />
    )

    const button = screen.getByRole('button', { name: 'Load older messages' })
    fireEvent.click(button)
    expect(onLoadOlder).toHaveBeenCalled()
  })

  it('disables the load-older button while older messages load', () => {
    const msgs: any = [{ id: '1', content: 'Msg 1', created_at: '2023-01-01T10:00:00Z' }]
    render(
      <MessageList
        messages={msgs}
        isGM={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        hasMore
        loadingOlder
        onLoadOlder={vi.fn()}
      />
    )

    const button = screen.getByRole('button', { name: 'Loading older messages...' })
    expect(button).toBeDisabled()
  })

  it('renders list of messages', () => {
    const msgs: any = [
      { id: '1', content: 'Msg 1', created_at: '2023-01-01T10:00:00Z' },
      { id: '2', content: 'Msg 2', created_at: '2023-01-01T10:05:00Z' },
      { id: '3', content: 'Msg 3', created_at: '2023-01-02T10:05:00Z' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getAllByTestId('msg-item')).toHaveLength(3)
    expect(screen.getByText('Msg 1')).toBeInTheDocument()
    // Initial load with no unread messages pins directly via scrollTop, not
    // scrollIntoView (that path is reserved for the unread divider).
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('clips horizontal overflow so the list does not scroll sideways', () => {
    const msgs: any = [
      { id: '1', content: 'Msg 1', created_at: '2023-01-01T10:00:00Z' }
    ]
    const { container } = render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const scrollContainer = container.firstChild as HTMLElement
    expect(scrollContainer.className).toContain('overflow-x-hidden')
    expect(scrollContainer.className).toContain('overflow-y-auto')
  })

  it('renders date dividers correctly', () => {
    const msgs: any = [
      { id: '1', content: 'Msg 1', created_at: '2023-01-01T10:00:00Z' },
      { id: '2', content: 'Msg 2', created_at: '2023-01-01T15:00:00Z' },
      { id: '3', content: 'Msg 3', created_at: '2023-01-02T10:00:00Z' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    
    const dividers = screen.getAllByTestId('date-divider')
    expect(dividers).toHaveLength(2) // 1st day gets one, 2nd day gets one
    
    const expectedDate1 = new Date('2023-01-01T10:00:00Z').toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const expectedDate2 = new Date('2023-01-02T10:00:00Z').toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    
    expect(screen.getByText(expectedDate1)).toBeInTheDocument()
    expect(screen.getByText(expectedDate2)).toBeInTheDocument()
  })

  it('renders new messages divider when messages straddle lastReadAt', () => {
    const msgs: any = [
      { id: '1', content: 'Old', created_at: '2023-01-01T10:00:00Z' },
      { id: '2', content: 'New', created_at: '2023-01-01T15:00:00Z' },
      { id: '3', content: 'Also new', created_at: '2023-01-01T16:00:00Z' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} lastReadAt="2023-01-01T12:00:00Z" />)

    const dividers = screen.getAllByTestId('new-messages-divider')
    expect(dividers).toHaveLength(1)
    expect(screen.getByText('New messages')).toBeInTheDocument()
  })

  it('renders new messages divider before first message when all are new', () => {
    const msgs: any = [
      { id: '1', content: 'Fresh', created_at: '2023-01-02T10:00:00Z' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} lastReadAt="2023-01-01T12:00:00Z" />)

    const divider = screen.getByTestId('new-messages-divider')
    const item = screen.getByTestId('msg-item')
    expect(divider.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not render new messages divider when all messages predate lastReadAt', () => {
    const msgs: any = [
      { id: '1', content: 'Old', created_at: '2023-01-01T10:00:00Z' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} lastReadAt="2023-01-01T12:00:00Z" />)

    expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument()
  })

  it('does not render new messages divider when lastReadAt is not provided', () => {
    const msgs: any = [
      { id: '1', content: 'Msg', created_at: '2023-01-01T10:00:00Z' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument()
  })

  it('does not render new messages divider for own messages after lastReadAt', () => {
    const msgs: any = [
      { id: '1', content: 'Old', created_at: '2023-01-01T10:00:00Z', sender_id: 'other' },
      { id: '2', content: 'My own message', created_at: '2023-01-01T15:00:00Z', sender_id: 'u1' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} lastReadAt="2023-01-01T12:00:00Z" />)

    expect(screen.queryByTestId('new-messages-divider')).not.toBeInTheDocument()
  })

  it('still renders new messages divider when another member sends after lastReadAt', () => {
    const msgs: any = [
      { id: '1', content: 'Old', created_at: '2023-01-01T10:00:00Z', sender_id: 'other' },
      { id: '2', content: 'Their message', created_at: '2023-01-01T15:00:00Z', sender_id: 'other' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} lastReadAt="2023-01-01T12:00:00Z" />)

    expect(screen.getAllByTestId('new-messages-divider')).toHaveLength(1)
  })
})

describe('MessageList scroll anchoring', () => {
  let scrollTop = 0
  let scrollHeight = 0

  beforeEach(() => {
    scrollTop = 0
    scrollHeight = 0
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })
    Object.defineProperty(window.HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => { scrollTop = v },
    })
  })

  afterEach(() => {
    delete (window.HTMLElement.prototype as any).scrollHeight
    delete (window.HTMLElement.prototype as any).scrollTop
  })

  const base = (): any[] => [
    { id: 'm1', content: 'M1', created_at: '2023-01-01T10:00:00Z' },
    { id: 'm2', content: 'M2', created_at: '2023-01-01T10:05:00Z' },
  ]

  it('keeps the viewport anchored when older messages are prepended', () => {
    scrollHeight = 1000

    const { rerender, container } = render(
      <MessageList messages={base()} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} hasMore onLoadOlder={vi.fn()} />
    )
    // Initial load lands on the bottom (no unread divider).
    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 1000)

    // The user scrolls up, then older messages are prepended.
    const list = container.firstChild as HTMLElement
    list.scrollTop = 800
    fireEvent.scroll(list)

    scrollHeight = 1200
    rerender(
      <MessageList
        messages={[{ id: 'm0', content: 'M0', created_at: '2023-01-01T09:00:00Z' }, ...base()]}
        isGM={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        hasMore
        onLoadOlder={vi.fn()}
      />
    )

    // 200px were added above the viewport; scrollTop should grow by that much
    // so the same messages stay on screen instead of jumping to the bottom.
    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 1000)
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls to the newest message when a new message is appended while at the bottom', () => {
    scrollHeight = 1000

    const { rerender, container } = render(
      <MessageList messages={base()} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />
    )
    // Initial load pinned to the bottom.
    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 1000)

    scrollHeight = 1100
    rerender(
      <MessageList
        messages={[...base(), { id: 'm3', content: 'M3', created_at: '2023-01-01T10:10:00Z' }]}
        isGM={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 1100)
  })

  it('keeps pinned to the bottom when content grows while at the bottom (lazy images)', () => {
    scrollHeight = 1000
    const { container } = render(
      <MessageList messages={base()} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />
    )
    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 1000)

    // Content below the fold finishes loading: height grows, no message change.
    scrollHeight = 1400
    const observers = (globalThis as any).__resizeObservers
    observers[observers.length - 1].trigger()

    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 1400)
  })

  it('does not re-pin when content grows while the user has scrolled up', () => {
    scrollHeight = 1000
    const { container } = render(
      <MessageList messages={base()} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />
    )
    const list = container.firstChild as HTMLElement
    list.scrollTop = 300
    fireEvent.scroll(list)

    scrollHeight = 1400
    const observers = (globalThis as any).__resizeObservers
    observers[observers.length - 1].trigger()

    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 300)
  })

  it('restores the scroll position the browser dropped while hidden', () => {
    const setVisibility = (state: string) =>
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })

    scrollHeight = 1000
    const { container } = render(
      <MessageList messages={base()} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />
    )
    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 1000)

    // User scrolled up into history before backgrounding.
    ;(container.firstChild as HTMLElement).scrollTop = 300
    fireEvent.scroll(container.firstChild as HTMLElement)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    // The browser resets the scroll position while the app is hidden
    // (mobile Safari behavior).
    ;(container.firstChild as HTMLElement).scrollTop = 0

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    // Position is restored, not re-anchored to the bottom or divider.
    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 300)
    setVisibility('visible')
  })

  it('preserves the scroll position on restore while the user is reading history', () => {
    const setVisibility = (state: string) =>
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })

    const msgs: any[] = [
      { id: 'm1', content: 'Old', created_at: '2023-01-01T10:00:00Z', sender_id: 'other' },
      { id: 'm2', content: 'Unread', created_at: '2023-01-01T15:00:00Z', sender_id: 'other' },
    ]
    const { container } = render(
      <MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} lastReadAt="2023-01-01T12:00:00Z" />
    )
    ;(container.firstChild as HTMLElement).scrollTop = 300
    fireEvent.scroll(container.firstChild as HTMLElement)
    vi.mocked(window.HTMLElement.prototype.scrollIntoView).mockClear()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled()
    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 300)
  })

  it('does not scroll again on restore when the position was preserved', () => {
    const setVisibility = (state: string) =>
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })

    scrollHeight = 1000
    const { container } = render(
      <MessageList messages={base()} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />
    )
    ;(container.firstChild as HTMLElement).scrollTop = 1000

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(container.firstChild as HTMLElement).toHaveProperty('scrollTop', 1000)
  })
})
