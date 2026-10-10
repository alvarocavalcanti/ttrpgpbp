import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { AdminMessagesView } from './AdminMessagesView'

// The child panes own their own scrolling; this test only guards the container's
// height contract.
vi.mock('./ThreadList', () => ({ ThreadList: () => <div data-testid="thread-list" /> }))
vi.mock('./ThreadDetail', () => ({ ThreadDetail: () => <div data-testid="thread-detail" /> }))

describe('AdminMessagesView', () => {
  it('fills its bounded parent and passes the height down with min-h-0', () => {
    const { container } = render(<AdminMessagesView />)

    // DAMP literals so a change to the layout contract breaks this on purpose.
    // `flex-1 min-h-0` lets the pane shrink to the bounded <main> so its own
    // overflow scrolls; without min-h-0 the content grows past the box and the
    // document scrolls / pulls to refresh instead.
    const root = container.firstElementChild!
    expect(root).toHaveClass('flex-1')
    expect(root).toHaveClass('min-h-0')
    expect(root).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('thread-list')).toBeInTheDocument()
  })

  it('shows the empty-detail prompt until a thread is selected', () => {
    render(<AdminMessagesView />)
    expect(screen.getByText('Select a message thread')).toBeInTheDocument()
    expect(screen.queryByTestId('thread-detail')).not.toBeInTheDocument()
  })
})
