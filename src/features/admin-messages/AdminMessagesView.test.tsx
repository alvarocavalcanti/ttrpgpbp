import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AdminMessagesView } from './AdminMessagesView'

// The child panes own their own scrolling; this test only guards the container's
// height contract and the bug-report compose shortcut (#796).
vi.mock('./ThreadList', () => ({
  ThreadList: (props: { composeRequest?: number }) => (
    <div data-testid="thread-list" data-compose={props.composeRequest} />
  ),
}))
vi.mock('./ThreadDetail', () => ({ ThreadDetail: () => <div data-testid="thread-detail" /> }))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

function renderView(initialEntry = '/messages') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminMessagesView />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('AdminMessagesView', () => {
  it('fills its bounded parent and passes the height down with min-h-0', () => {
    const { container } = renderView()

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
    renderView()
    expect(screen.getByText('Select a message thread')).toBeInTheDocument()
    expect(screen.queryByTestId('thread-detail')).not.toBeInTheDocument()
  })

  it('opens the bug-report composer from ?compose=bug and clears the param', () => {
    renderView('/messages?compose=bug')
    expect(screen.getByTestId('thread-list')).toHaveAttribute('data-compose', '1')
    expect(screen.getByTestId('location-search')).toHaveTextContent('')
  })

  it('leaves the composer closed on a plain visit', () => {
    renderView()
    expect(screen.getByTestId('thread-list')).toHaveAttribute('data-compose', '0')
  })
})
