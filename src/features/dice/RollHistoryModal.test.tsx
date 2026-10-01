import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RollHistoryModal, getRollCritical } from './RollHistoryModal'
import { useRollHistory } from './useRollHistory'

vi.mock('./useRollHistory', () => ({
  useRollHistory: vi.fn()
}))

const mockHook = ({ rolls = [], loading = false, error = null }:
  { rolls?: any[], loading?: boolean, error?: string | null } = {}) => {
  vi.mocked(useRollHistory).mockReturnValue({ rolls, loading, error } as any)
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
  it('normalizes whitespace in the notation', () => {
    expect(getRollCritical('1 d 20 + 5', 25, { rolls: [20], modifier: 5 })).toBe('success')
    expect(getRollCritical('2 d 20 k h 1', 20, { rolls: [12, 20], dropped: [12] })).toBe('success')
  })
  it('caps the kept count at the rolled dice for kh/kl', () => {
    expect(getRollCritical('1d20kh2', 20, { rolls: [20] })).toBe('success')
  })
  it('never flags pool rolls, even on a natural 20 or 1', () => {
    expect(getRollCritical('1d20p', 0, { rolls: [20], mode: 'pool' })).toBeNull()
    expect(getRollCritical('1d20>=10', 1, { rolls: [1], mode: 'successes', target: 10, successes: 1 })).toBeNull()
    expect(getRollCritical('1d20>=10', 1, { rolls: [20], mode: 'successes', target: 10, successes: 1 })).toBeNull()
  })
  it('still flags pre-pool rows that carry no mode', () => {
    expect(getRollCritical('1d20', 20, { rolls: [20] })).toBe('success')
  })
})

describe('RollHistoryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    mockHook({ loading: true })

    const { container } = render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('renders empty state when no rolls', () => {
    mockHook()

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    expect(screen.getByText('No dice rolls yet.')).toBeInTheDocument()
  })

  it('renders an error when fetching rolls fails', () => {
    mockHook({ error: 'Failed to load roll history.' })

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    expect(screen.getByText('Failed to load roll history.')).toBeInTheDocument()
  })

  it('renders roll history', () => {
    mockHook({
      rolls: [{
        id: 'r1',
        roller_id: 'u1',
        notation: '1d20+5',
        result: 23,
        breakdown: { rolls: [18], dropped: [], modifier: 5 },
        created_at: new Date().toISOString(),
        roller_character_name: 'Hero',
        roller: { character_name: 'Hero' }
      }]
    })

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    expect(screen.getByText('Hero')).toBeInTheDocument()
    expect(screen.getByText('1d20+5')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
    expect(screen.getByText(/Rolls:/).parentElement).toHaveTextContent('Rolls: [18]')
    expect(screen.getByText(/Modifier:/).parentElement).toHaveTextContent('Modifier: +5')
  })

  it('shows the channel character name, not the account display name (issue #640)', () => {
    mockHook({
      rolls: [{
        id: 'r1',
        roller_id: 'u1',
        notation: '1d20',
        result: 15,
        breakdown: { rolls: [15] },
        created_at: new Date().toISOString(),
        roller_character_name: 'Rowan the Bold',
        roller: { character_name: 'Rowan the Bold' }
      }]
    })

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    expect(screen.getByText('Rowan the Bold')).toBeInTheDocument()
  })

  it('shows a Critical Success badge for a natural 20', () => {
    mockHook({
      rolls: [{
        id: 'r1',
        roller_id: 'u1',
        notation: '1d20',
        result: 20,
        breakdown: { rolls: [20], dropped: [], modifier: 0 },
        created_at: new Date().toISOString(),
        roller_character_name: 'Hero',
        roller: { character_name: 'Hero' }
      }]
    })

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    expect(screen.getByText('Critical Success')).toBeInTheDocument()
  })

  it('renders raw pool faces instead of a zero total', () => {
    mockHook({
      rolls: [{
        id: 'r2',
        roller_id: 'u1',
        notation: '5d6p',
        result: 0,
        breakdown: { rolls: [2, 5, 3, 6, 1], dropped: [], modifier: 0, mode: 'pool' },
        created_at: new Date().toISOString(),
        roller_character_name: 'Hero',
        roller: { character_name: 'Hero' }
      }]
    })

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    const cell = screen.getByText('Result').parentElement!
    expect(cell).toHaveTextContent('2, 5, 3, 6, 1')
    expect(cell.textContent).not.toMatch(/Result\s*0/)
  })

  it('renders success pools as a labeled count with the target', () => {
    mockHook({
      rolls: [{
        id: 'r3',
        roller_id: 'u1',
        notation: '5d6>=4',
        result: 2,
        breakdown: { rolls: [2, 5, 3, 6, 1], dropped: [], modifier: 0, mode: 'successes', target: 4, successes: 2 },
        created_at: new Date().toISOString(),
        roller_character_name: 'Hero',
        roller: { character_name: 'Hero' }
      }]
    })

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    expect(screen.getByText('2 successes (≥4)')).toBeInTheDocument()
  })

  it('singularizes a single success in history', () => {
    mockHook({
      rolls: [{
        id: 'r4',
        roller_id: 'u1',
        notation: '2d20>=10',
        result: 1,
        breakdown: { rolls: [1, 20], dropped: [], modifier: 0, mode: 'successes', target: 10, successes: 1 },
        created_at: new Date().toISOString(),
        roller_character_name: 'Hero',
        roller: { character_name: 'Hero' }
      }]
    })

    render(<RollHistoryModal channelId="c1" onClose={vi.fn()} />)

    expect(screen.getByText('1 success (≥10)')).toBeInTheDocument()
    expect(screen.queryByText('Critical Failure')).not.toBeInTheDocument()
  })
})
