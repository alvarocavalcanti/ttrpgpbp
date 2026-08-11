import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SafetyToolsModal } from './SafetyToolsModal'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('SafetyToolsModal', () => {
  it('renders safety tools doc link when URL provided', () => {
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) } as any)
    render(<SafetyToolsModal channelId="c1" safetyToolsUrl="https://docs.google.com/doc" isGM={false} onClose={vi.fn()} />)

    const link = screen.getByText('Open Safety Tools Doc')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', 'https://docs.google.com/doc')
  })

  it('displays Lines and Veils content', async () => {
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { channel_id: 'c1', lines: 'no gore\nno harm to children', veils: 'romance stays off-screen', updated_at: '2026-01-01' }, error: null }) }) }) } as any)
    render(<SafetyToolsModal channelId="c1" safetyToolsUrl={null} isGM={false} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/no gore/)).toBeInTheDocument()
      expect(screen.getByText(/romance stays off-screen/)).toBeInTheDocument()
    })
  })

  it('shows placeholder copy when no Lines & Veils are set', async () => {
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) } as any)
    render(<SafetyToolsModal channelId="c1" safetyToolsUrl={null} isGM={false} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/No Lines set/)).toBeInTheDocument()
      expect(screen.getByText(/No Veils set/)).toBeInTheDocument()
    })
  })

  it('shows GM edit hint only for GMs', async () => {
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) } as any)
    const { rerender } = render(<SafetyToolsModal channelId="c1" safetyToolsUrl={null} isGM={true} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/Edit Lines & Veils in Channel Settings/)).toBeInTheDocument()
    })

    rerender(<SafetyToolsModal channelId="c1" safetyToolsUrl={null} isGM={false} onClose={vi.fn()} />)
    expect(screen.queryByText(/Edit Lines & Veils in Channel Settings/)).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop clicked', () => {
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) } as any)
    const mockOnClose = vi.fn()
    render(<SafetyToolsModal channelId="c1" safetyToolsUrl={null} isGM={false} onClose={mockOnClose} />)
    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(mockOnClose).toHaveBeenCalled()
  })
})
