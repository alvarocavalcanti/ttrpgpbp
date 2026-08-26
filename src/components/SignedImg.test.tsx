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
  let resolve!: (v: { data: { signedUrl: string | null } | null; error: Error | null }) => void

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x.jpg' }, error: null })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrl: mockCreateSignedUrl } as any)
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
})