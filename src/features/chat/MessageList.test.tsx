import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

  it('renders list of messages', () => {
    const msgs: any = [
      { id: '1', content: 'Msg 1', created_at: '2023-01-01T10:00:00Z' },
      { id: '2', content: 'Msg 2', created_at: '2023-01-01T10:05:00Z' },
      { id: '3', content: 'Msg 3', created_at: '2023-01-02T10:05:00Z' }
    ]
    render(<MessageList messages={msgs} isGM={false} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getAllByTestId('msg-item')).toHaveLength(3)
    expect(screen.getByText('Msg 1')).toBeInTheDocument()
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
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
})
