import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RollHistoryModal } from './RollHistoryModal'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn()
  }
}))

describe('RollHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    // Mock to never resolve so loading state is visible
    const mockLimit = vi.fn().mockReturnValue(new Promise(() => {}))
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }) } as any)

    const { container } = render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('renders empty state when no rolls', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }) } as any)

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('No dice rolls yet.')).toBeInTheDocument()
    })
  })

  it('renders an error when fetching rolls fails', async () => {
    const mockLimit = vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }) } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load roll history.')).toBeInTheDocument()
    })
  })

  it('renders roll history', async () => {
    const mockData = [
      {
        id: 'r1',
        roller_id: 'u1',
        notation: '1d20+5',
        result: 23,
        breakdown: { rolls: [18], dropped: [], modifier: 5 },
        created_at: new Date().toISOString(),
        roller: [{ display_name: 'Hero' }]
      }
    ]
    
    const mockLimit = vi.fn().mockResolvedValue({ data: mockData, error: null })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }) } as any)

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Hero')).toBeInTheDocument()
      expect(screen.getByText('1d20+5')).toBeInTheDocument()
      expect(screen.getByText('23')).toBeInTheDocument()
      expect(screen.getByText(/Rolls:/).parentElement).toHaveTextContent('Rolls: [18]')
      expect(screen.getByText(/Modifier:/).parentElement).toHaveTextContent('Modifier: +5')
    })
  })
})
