import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SignedImg } from './SignedImg'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: { from: vi.fn() },
  },
}))

const CHANNEL_ID = '00000000-0000-0000-0000-000000000001'

describe('SignedImg', () => {
  const mockCreateSignedUrl = vi.fn()
  const mockInfo = vi.fn()
  let resolve!: (v: { data: { signedUrl: string | null } | null; error: Error | null }) => void

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x.jpg' }, error: null })
    mockInfo.mockResolvedValue({ data: { metadata: {} }, error: null })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrl: mockCreateSignedUrl, info: mockInfo } as any)
  })

  it('renders an external URL as-is', () => {
    render(<SignedImg src="https://game-icons.net/x.svg" alt="icon" className="h-8 w-8" />)
    const img = screen.getByRole('img', { name: 'icon' })
    expect(img).toHaveAttribute('src', 'https://game-icons.net/x.svg')
    expect(screen.queryByTestId('signed-img-loading')).not.toBeInTheDocument()
  })

  it('renders nothing for a null src', () => {
    const { container } = render(<SignedImg src={undefined} alt="x" />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a placeholder while a bucket path is being signed, then the image', async () => {
    mockCreateSignedUrl.mockReturnValue(new Promise((r) => { resolve = r }))
    const { rerender } = render(<SignedImg src={`${CHANNEL_ID}/message/u.jpg`} alt="map" className="max-h-96" />)

    expect(screen.getByTestId('signed-img-loading')).toBeInTheDocument()
    expect(screen.getByTestId('signed-img-loading')).toHaveClass('max-h-96')

    await act(async () => resolve({ data: { signedUrl: 'https://signed/u.jpg' }, error: null }))
    rerender(<SignedImg src={`${CHANNEL_ID}/message/u.jpg`} alt="map" className="max-h-96" />)

    expect(screen.queryByTestId('signed-img-loading')).not.toBeInTheDocument()
    const img = screen.getByRole('img', { name: 'map' })
    expect(img).toHaveAttribute('src', 'https://signed/u.jpg')
  })

  it('reserves the box on the placeholder from the stored size while signing', async () => {
    mockInfo.mockResolvedValue({ data: { metadata: { width: 512, height: 288 } }, error: null })
    mockCreateSignedUrl.mockReturnValue(new Promise((r) => { resolve = r }))
    render(<SignedImg src={`${CHANNEL_ID}/message/map.jpg`} alt="map" className="max-h-96" reserveBox />)

    // Dimensions arrive from metadata while the signed URL is still pending.
    await act(async () => {})
    const placeholder = screen.getByTestId('signed-img-loading')
    expect(placeholder.style.aspectRatio).toBe('512 / 288')
    expect(placeholder.style.width).toBe('min(100%, 512px)')
  })

  it('sets the intrinsic width/height and aspect ratio on the loaded image', async () => {
    mockInfo.mockResolvedValue({ data: { metadata: { width: 512, height: 288 } }, error: null })
    render(<SignedImg src={`${CHANNEL_ID}/message/map.jpg`} alt="map" className="max-h-96" reserveBox />)
    await act(async () => {})

    const img = screen.getByRole('img', { name: 'map' })
    expect(img).toHaveAttribute('width', '512')
    expect(img).toHaveAttribute('height', '288')
    expect(img.style.aspectRatio).toBe('512 / 288')
  })

  it('does not reserve a box without reserveBox (fixed-size avatars stay as-is)', async () => {
    mockInfo.mockResolvedValue({ data: { metadata: { width: 512, height: 288 } }, error: null })
    render(<SignedImg src={`${CHANNEL_ID}/avatar/u.jpg`} alt="a" className="h-8 w-8" />)
    await act(async () => {})

    const img = screen.getByRole('img', { name: 'a' })
    expect(img).not.toHaveAttribute('width')
    expect(img).not.toHaveAttribute('height')
    expect(img.style.aspectRatio).toBe('')
  })

  it('does not reserve a box when the size is unknown (legacy / external)', async () => {
    mockInfo.mockResolvedValue({ data: { metadata: {} }, error: null })
    render(<SignedImg src={`${CHANNEL_ID}/message/legacy.jpg`} alt="legacy" className="max-h-96" reserveBox />)
    await act(async () => {})

    const img = screen.getByRole('img', { name: 'legacy' })
    expect(img).not.toHaveAttribute('width')
    expect(img).not.toHaveAttribute('height')
    expect(img.style.aspectRatio).toBe('')
  })
})
