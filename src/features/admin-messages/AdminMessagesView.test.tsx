import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AdminMessagesView } from './AdminMessagesView'

// The child panes own their own scrolling; this test only guards the container's
// height contract.
vi.mock('./ThreadList', () => ({ ThreadList: () => <div data-testid="thread-list" /> }))
vi.mock('./ThreadDetail', () => ({ ThreadDetail: () => <div data-testid="thread-detail" /> }))

describe('AdminMessagesView', () => {
  it('bounds itself to the space below the app nav so it scrolls internally', () => {
    const { container } = render(<AdminMessagesView />)

    // DAMP literal so a change to the height contract breaks this test on
    // purpose. Without a bounded ancestor the Messages panes grew the whole
    // document and scrolled both headers off-screen.
    expect(container.firstElementChild).toHaveClass('h-[calc(100dvh-4.5rem)]')
    expect(screen.getByTestId('thread-list')).toBeInTheDocument()
  })

  it('shows the empty-detail prompt until a thread is selected', () => {
    render(<AdminMessagesView />)
    expect(screen.getByText('Select a message thread')).toBeInTheDocument()
    expect(screen.queryByTestId('thread-detail')).not.toBeInTheDocument()
  })
})
