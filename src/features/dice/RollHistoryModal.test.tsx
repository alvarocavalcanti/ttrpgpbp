import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RollHistoryModal, getRollCritical } from './RollHistoryModal'
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

describe('getRollCritical', () => {
  it('flags a natural 20 as Critical Success', () => {
    expect(getRollCritical('1d20', 20, { rolls: [20] })).toBe('success')
  })
  it('flags a natural 1 as Critical Failure', () => {
    expect(getRollCritical('1d20', 1, { rolls: [1] })).toBe('failure')
  })
  it('uses the unmodified die, ignoring the modifier', () => {
    expect(getRollCritical('1d20+5', 25, { rolls: [20], modifier: 5 })).toBe('success')
    expect(getRollCritical('1d20-4', -3, { rolls: [1], modifier: -4 })).toBe('failure')
  })
  it('flags advantage/disadvantage via the kept die', () => {
    expect(getRollCritical('2d20kh1', 20, { rolls: [12, 20], dropped: [12] })).toBe('success')
    expect(getRollCritical('2d20kl1', 1, { rolls: [20, 1], dropped: [20] })).toBe('failure')
  })
  it('returns null for non-crit d20 rolls', () => {
    expect(getRollCritical('1d20', 15, { rolls: [15] })).toBeNull()
    expect(getRollCritical('1d20', 13, { rolls: [10], modifier: 3 })).toBeNull()
    expect(getRollCritical('2d20kh1', 12, { rolls: [12, 5], dropped: [5] })).toBeNull()
  })
  it('returns null for non-d20 or multi-kept rolls', () => {
    expect(getRollCritical('1d6', 6, { rolls: [6] })).toBeNull()
    expect(getRollCritical('2d6', 12, { rolls: [6, 6] })).toBeNull()
    expect(getRollCritical('2d20kh2', 20, { rolls: [10, 10] })).toBeNull()
  })
})

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

  it('renders an error and no rolls when RPC returns invalid row data', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ id: 'bad', notation: 123 }], error: null } as any)
    mockChannel()

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load roll history.')).toBeInTheDocument()
    })
    expect(screen.queryByText('No dice rolls yet.')).not.toBeInTheDocument()
    expect(screen.queryByText('123')).not.toBeInTheDocument()
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

  it('shows a Critical Success badge for a natural 20', async () => {
    const mockData = [
      {
        id: 'r1',
        roller_id: 'u1',
        notation: '1d20',
        result: 20,
        breakdown: { rolls: [20], dropped: [], modifier: 0 },
        created_at: new Date().toISOString(),
        roller_display_name: 'Hero'
      }
    ]

    vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any)
    mockChannel()

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Critical Success')).toBeInTheDocument()
    })
  })

  it('skips a malformed realtime INSERT row instead of crashing', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    mockChannel()
    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('No dice rolls yet.')).toBeInTheDocument()
    })

    const onMock = vi.mocked(supabase.channel).mock.results[0].value.on
    const insertCb = onMock.mock.calls.find((c: unknown[]) => (c[0] as string) === 'postgres_changes')[2]
    await insertCb({ new: { id: 'x', notation: 123 } })

    expect(supabase.from).not.toHaveBeenCalledWith('profiles')
    expect(screen.getByText('No dice rolls yet.')).toBeInTheDocument()
  })

  it('appends a valid realtime INSERT row', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { display_name: 'Foo' }, error: null })
        })
      })
    } as any)
    mockChannel()
    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('No dice rolls yet.')).toBeInTheDocument()
    })

    const onMock = vi.mocked(supabase.channel).mock.results[0].value.on
    const insertCb = onMock.mock.calls.find((c: unknown[]) => (c[0] as string) === 'postgres_changes')[2]
    await insertCb({
      new: {
        id: 'r2',
        roller_id: 'u2',
        notation: '1d6',
        result: 4,
        breakdown: { rolls: [4] },
        created_at: new Date().toISOString()
      }
    })

    await waitFor(() => {
      expect(screen.getByText('Foo')).toBeInTheDocument()
      expect(screen.getByText('1d6')).toBeInTheDocument()
    })
  })
})
