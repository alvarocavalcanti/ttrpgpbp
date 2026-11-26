import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AdminMessagesView } from './AdminMessagesView'

// The child panes own their own scrolling; this test only guards the container's
// height contract, the bug-report compose shortcut (#796), and the selection
// guard around a thread delete completed after the admin moved on.
const view = vi.hoisted(() => ({
  threads: [{ id: 't-a', subject: 'A' }, { id: 't-b', subject: 'B' }],
  // The back handler rendered for t-a, kept so a pending delete can call it
  // after another thread has been selected.
  staleBack: { current: null as null | (() => void) },
}))

vi.mock('./ThreadList', () => ({
  ThreadList: (props: { composeRequest?: number, onSelectThread: (thread: unknown) => void, selectedThreadId?: string }) => (
    <div data-testid="thread-list" data-compose={props.composeRequest} data-selected={props.selectedThreadId ?? ''}>
      <button type="button" onClick={() => props.onSelectThread(view.threads[0])}>select-a</button>
      <button type="button" onClick={() => props.onSelectThread(view.threads[1])}>select-b</button>
    </div>
  ),
}))
vi.mock('./ThreadDetail', () => ({
  ThreadDetail: (props: { thread: { id: string }, onBack: () => void }) => {
    if (props.thread.id === 't-a') view.staleBack.current = props.onBack
    return (
      <div data-testid="thread-detail" data-thread={props.thread.id}>
        <button type="button" onClick={props.onBack}>current-back</button>
      </div>
    )
  },
}))

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

  it('goes back when the deleted thread is still selected', () => {
    renderView()
    fireEvent.click(screen.getByText('select-a'))
    expect(screen.getByTestId('thread-detail')).toHaveAttribute('data-thread', 't-a')

    fireEvent.click(screen.getByText('current-back'))

    expect(screen.getByText('Select a message thread')).toBeInTheDocument()
  })

  it('keeps a thread opened while a delete was pending', () => {
    renderView()
    fireEvent.click(screen.getByText('select-a'))
    fireEvent.click(screen.getByText('select-b'))

    act(() => { view.staleBack.current!() })

    expect(screen.getByTestId('thread-detail')).toHaveAttribute('data-thread', 't-b')
  })
})
