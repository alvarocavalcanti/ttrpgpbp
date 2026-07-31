import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelView } from './ChannelView'
import { useChannel } from './useChannel'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('./useChannel', () => ({
  useChannel: vi.fn()
}))

vi.mock('./ChannelSettings', () => ({
  ChannelSettings: ({ onClose }: any) => (
    <div data-testid="channel-settings">
      <button onClick={onClose}>Close Settings</button>
    </div>
  )
}))

vi.mock('./MemberList', () => ({
  MemberList: () => <div data-testid="member-list" />
}))

describe('ChannelView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: null,
      members: [],
      loading: true,
      error: null,
      isGM: false,
      myMemberInfo: undefined
    })

    const { container } = render(
      <MemoryRouter initialEntries={['/channel/c1']}>
        <Routes>
          <Route path="/channel/:id" element={<ChannelView />} />
        </Routes>
      </MemoryRouter>
    )

    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('redirects to home if error or no channel', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: null,
      members: [],
      loading: false,
      error: new Error('Failed'),
      isGM: false,
      myMemberInfo: undefined
    })

    render(
      <MemoryRouter initialEntries={['/channel/c1']}>
        <Routes>
          <Route path="/channel/:id" element={<ChannelView />} />
          <Route path="/" element={<div data-testid="home" />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('redirects to join if not member and not GM', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test' } as any,
      members: [],
      loading: false,
      error: null,
      isGM: false,
      myMemberInfo: undefined
    })

    render(
      <MemoryRouter initialEntries={['/channel/c1']}>
        <Routes>
          <Route path="/channel/:id" element={<ChannelView />} />
          <Route path="/join/:id" element={<div data-testid="join-page" />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('join-page')).toBeInTheDocument()
  })

  it('renders channel view if member', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel', status_text: 'Active', map_url: 'http://map', resources_url: 'http://resources' } as any,
      members: [],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { id: 'm1' } as any
    })

    render(
      <MemoryRouter initialEntries={['/channel/c1']}>
        <Routes>
          <Route path="/channel/:id" element={<ChannelView />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByText('Test Channel')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Map')).toHaveAttribute('href', 'http://map')
    expect(screen.getByText('Resources')).toHaveAttribute('href', 'http://resources')
    expect(screen.getByTestId('member-list')).toBeInTheDocument()
  })

  it('toggles settings modal for GM', () => {
    vi.mocked(useChannel).mockReturnValue({
      channel: { id: 'c1', name: 'Test Channel' } as any,
      members: [],
      loading: false,
      error: null,
      isGM: true,
      myMemberInfo: { id: 'm1' } as any
    })

    render(
      <MemoryRouter initialEntries={['/channel/c1']}>
        <Routes>
          <Route path="/channel/:id" element={<ChannelView />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Settings'))
    expect(screen.getByTestId('channel-settings')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Close Settings'))
    expect(screen.queryByTestId('channel-settings')).not.toBeInTheDocument()
  })
})
