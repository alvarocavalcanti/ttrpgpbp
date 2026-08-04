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
  })
})
