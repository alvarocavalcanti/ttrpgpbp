import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RollHistoryModal } from './RollHistoryModal'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    removeChannel: vi.fn(),
    channel: vi.fn()
  }
}))

function mockChannel() {
  vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) }) } as any)
}

describe('RollHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    // Mock to never resolve so loading state is visible
    vi.mocked(supabase.rpc).mockReturnValue(new Promise(() => {}) as any)
    mockChannel()

    const { container } = render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('renders empty state when no rolls', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    mockChannel()

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('No dice rolls yet.')).toBeInTheDocument()
    })
    expect(supabase.rpc).toHaveBeenCalledWith('get_channel_roll_history', { p_channel_id: 'c1' })
  })

  it('renders an error when fetching rolls fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('DB error') } as any)
    mockChannel()
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
        roller_display_name: 'Hero'
      }
    ]

    vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any)
    mockChannel()

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
