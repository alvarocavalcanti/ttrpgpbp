import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SubChannelTabs } from './SubChannelTabs'
import type { SubChannel } from './useSubChannels'

const room = (over: Partial<SubChannel> = {}): SubChannel => ({
  id: 'r1',
  channel_id: 'c1',
  name: 'OOC',
  is_archived: false,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...over,
})

const renderTabs = (props: Partial<Parameters<typeof SubChannelTabs>[0]> = {}) =>
  render(
    <MemoryRouter>
      <SubChannelTabs
        channelId="c1"
        channelName="Goblin Cave"
        subChannels={[]}
        counts={{}}
        activeSubId={null}
        loading={false}
        error={null}
        isGM={false}
        onManage={vi.fn()}
        onRetry={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )

describe('SubChannelTabs', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders nothing when the channel has no rooms', () => {
    const { container } = renderTabs({ subChannels: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders Main + rooms and links them to their routes', () => {
    renderTabs({
      subChannels: [room({ id: 'r1', name: 'OOC' }), room({ id: 'r2', name: 'Dice' })],
    })

    expect(screen.getByRole('tablist', { name: 'Rooms' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Goblin Cave' })).toHaveAttribute('href', '/channel/c1')
    expect(screen.getByRole('tab', { name: 'OOC' })).toHaveAttribute('href', '/channel/c1/sub/r1')
    expect(screen.getByRole('tab', { name: 'Dice' })).toHaveAttribute('href', '/channel/c1/sub/r2')
  })

  it('marks the active tab from activeSubId', () => {
    renderTabs({ subChannels: [room({ id: 'r1' })], activeSubId: 'r1' })
    expect(screen.getByRole('tab', { name: 'OOC' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Goblin Cave' })).toHaveAttribute('aria-selected', 'false')
  })

  it('shows an unread dot only for rooms with a positive count', () => {
    renderTabs({
      subChannels: [room({ id: 'r1', name: 'OOC' }), room({ id: 'r2', name: 'Dice' })],
      counts: { r1: 3, r2: 0 },
    })
    expect(screen.getByLabelText('3 unread')).toBeInTheDocument()
    expect(screen.queryByLabelText('0 unread')).not.toBeInTheDocument()
  })

  it('shows the GM create/manage affordances only for a GM', () => {
    renderTabs({ subChannels: [room()], isGM: true })
    expect(screen.getByRole('button', { name: 'Add room' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manage rooms' })).toBeInTheDocument()
  })

  it('hides GM affordances for a player', () => {
    renderTabs({ subChannels: [room()], isGM: false })
    expect(screen.queryByRole('button', { name: 'Add room' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manage rooms' })).not.toBeInTheDocument()
  })

  it('shows skeleton pills while loading', () => {
    renderTabs({ loading: true })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('degrades to Main + Retry when the rooms fetch fails', () => {
    const onRetry = vi.fn()
    renderTabs({ error: new Error('boom'), onRetry })
    expect(screen.getByText("Couldn't load rooms")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
