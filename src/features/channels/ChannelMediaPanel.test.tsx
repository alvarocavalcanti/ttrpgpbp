import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelMediaPanel } from './ChannelMediaPanel'
import { useChannelMedia } from '../../hooks/useChannelMedia'

const { mockRefetch, mockItems } = vi.hoisted(() => ({
  mockRefetch: vi.fn(),
  mockItems: [
    { path: 'c1/message/a.jpg', name: 'a.jpg' },
    { path: 'c1/message/b.jpg', name: 'b.jpg' },
  ],
}))

vi.mock('../../hooks/useChannelMedia', () => ({
  useChannelMedia: vi.fn(() => ({ items: [], loading: false, error: null, refetch: mockRefetch })),
}))

vi.mock('../../components/SignedImg', () => ({
  SignedImg: ({ src, alt, className }: any) => <img src={src} alt={alt ?? ''} className={className} />,
}))

vi.mock('../../components/ImageViewerModal', () => ({
  ImageViewerModal: ({ onClose }: any) => (
    <div data-testid="image-viewer">
      <button type="button" onClick={onClose}>Close viewer</button>
    </div>
  ),
}))

describe('ChannelMediaPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useChannelMedia).mockReturnValue({
      items: mockItems,
      loading: false,
      error: null,
      refetch: mockRefetch,
    })
  })

  const renderPanel = (canInsert: boolean, onInsert = vi.fn()) =>
    render(<ChannelMediaPanel channelId="c1" canInsert={canInsert} onInsert={onInsert} onClose={vi.fn()} />)

  it('shows a spinner while loading', () => {
    vi.mocked(useChannelMedia).mockReturnValue({ items: [], loading: true, error: null, refetch: mockRefetch })
    renderPanel(false)
    expect(screen.getByRole('status', { name: 'Loading channel media' })).toBeInTheDocument()
  })

  it('shows the failure state with a Retry that refetches', () => {
    vi.mocked(useChannelMedia).mockReturnValue({ items: [], loading: false, error: 'boom', refetch: mockRefetch })
    renderPanel(false)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load channel media.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows an empty state when the channel has no images', () => {
    vi.mocked(useChannelMedia).mockReturnValue({ items: [], loading: false, error: null, refetch: mockRefetch })
    renderPanel(false)
    expect(screen.getByText(/No images yet/)).toBeInTheDocument()
  })

  it('renders the thumbnail grid for everyone', () => {
    renderPanel(false)
    const thumbs = screen.getAllByAltText('')
    expect(thumbs.map(t => t.getAttribute('src'))).toEqual(['c1/message/a.jpg', 'c1/message/b.jpg'])
  })

  it('opens the image viewer when a card is clicked, for both roles', () => {
    renderPanel(false)
    fireEvent.click(screen.getAllByRole('button', { name: 'View image fullscreen' })[0])
    expect(screen.getByTestId('image-viewer')).toBeInTheDocument()
  })

  it('keeps players browse-only: no selection and no insert control', () => {
    renderPanel(false)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Insert/ })).not.toBeInTheDocument()
  })

  it('lets the GM select images and insert them, then closes', () => {
    const onInsert = vi.fn()
    const onClose = vi.fn()
    render(<ChannelMediaPanel channelId="c1" canInsert={true} onInsert={onInsert} onClose={onClose} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select a.jpg' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select b.jpg' }))
    expect(screen.getByRole('button', { name: 'Insert (2)' })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Insert (2)' }))
    expect(onInsert).toHaveBeenCalledWith(['c1/message/a.jpg', 'c1/message/b.jpg'])
    expect(onClose).toHaveBeenCalled()
  })

  it('disables Insert until something is selected', () => {
    renderPanel(true)
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('toggles a selection off when clicked again', () => {
    renderPanel(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select a.jpg' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select a.jpg' }))
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('clears selections when the channel changes', async () => {
    const { rerender } = render(
      <ChannelMediaPanel channelId="c1" canInsert={true} onInsert={vi.fn()} onClose={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select a.jpg' }))
    expect(screen.getByRole('checkbox', { name: 'Select a.jpg' })).toHaveAttribute('aria-checked', 'true')

    rerender(<ChannelMediaPanel channelId="c2" canInsert={true} onInsert={vi.fn()} onClose={vi.fn()} />)

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Select a.jpg' })).toHaveAttribute('aria-checked', 'false')
    )
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled()
  })
})