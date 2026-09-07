import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChannelStatusBar } from './ChannelStatusBar'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

// jsdom reports 0 for both; we override so tests can simulate overflow (or the
// single-line no-overflow case) on the measured status container.
const setOverflow = (scrollHeight: number, clientHeight: number) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight })
}

describe('ChannelStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    setOverflow(0, 0)
  })

  it('renders null if no status and not GM', () => {
    const { container } = render(<ChannelStatusBar channelId="c1" statusText={null} activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders "No status set" if GM and no status', () => {
    render(<ChannelStatusBar channelId="c1" statusText={null} activePlayers={[]} isGM={true} onUpdate={vi.fn()} />)
    expect(screen.getByText('No status set.')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    // Literal touch-target requirement (UX audit): the bar's labeled text
    // button grows to 44px — asserted literally so a sizing regression fails.
    expect(screen.getByText('Edit').closest('button')!.className).toContain('min-h-11')
  })

  it('renders status prose from the shared proseAmber constant (P2-18)', () => {
    const { container } = render(<ChannelStatusBar channelId="c1" statusText="Initiative: Thor 18" activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    const prose = container.querySelector('.prose')!
    // Literals mirror src/features/chat/composerChip.ts on purpose (DAMP):
    // rewording the constant or inlining it back fails here.
    expect(prose.className).toContain('prose prose-sm max-w-none dark:prose-invert text-amber-900')
    expect(prose.className).toContain('prose-p:text-amber-900 dark:prose-p:text-amber-200')
    expect(prose.className).toContain('prose-ol:text-amber-900 dark:prose-ol:text-amber-200')
    // Collapsed by default: the space between the constant and line-clamp-1
    // must survive the template interpolation or the token merges and breaks.
    expect(prose.className).toContain('prose-ol:text-amber-200 line-clamp-1')
  })

  it('renders active players when provided', () => {
    render(<ChannelStatusBar channelId="c1" statusText={null} activePlayers={[{ character_name: 'Thor', user_id: 'u1' }]} isGM={false} onUpdate={vi.fn()} />)
    expect(screen.getByText('Active:')).toBeInTheDocument()
    expect(screen.getByText('Thor')).toBeInTheDocument()
  })

  it('renders markdown status text and toggles expansion', () => {
    setOverflow(100, 30)
    const { container } = render(<ChannelStatusBar channelId="c1" statusText="**Bold** status" activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    expect(screen.getByText('Bold').tagName).toBe('STRONG')
    
    const toggleButton = container.querySelector('button[aria-label="Expand Status"]')!
    expect(toggleButton).toBeInTheDocument()

    // Initially line-clamp-1
    expect(container.querySelector('.line-clamp-1')).toBeInTheDocument()

    // Audit P2-15: the disclosure chevron exposes its expanded state.
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false')

    // Expand
    fireEvent.click(toggleButton)
    expect(container.querySelector('.line-clamp-1')).not.toBeInTheDocument()
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true')
    expect(toggleButton).toHaveAttribute('aria-label', 'Collapse Status')
  })

  it('hides the chevron on single-line status text', () => {
    // Default (0/0) means no overflow — nothing to expand.
    const { container } = render(<ChannelStatusBar channelId="c1" statusText="Short status" activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    expect(container.querySelector('button[aria-label="Expand Status"]')).toBeNull()
  })

  it('shows the chevron only when the status text overflows', () => {
    setOverflow(100, 30)
    const { container } = render(<ChannelStatusBar channelId="c1" statusText="A very long status line that would overflow the single line clamp." activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    const chevron = container.querySelector('button[aria-label="Expand Status"]')!
    expect(chevron).toBeInTheDocument()
    // Literal touch-target requirement (UX-1): 24px chevron expanded to 44px
    // via invisible pseudo padding.
    expect(chevron.className).toContain('after:-inset-2.5')
    // The 10px hit-expansion needs room next to the Edit button (CodeRabbit):
    // the row gap is 12px (space-x-3) so the pseudo cannot overlap it.
    expect(chevron.parentElement?.className).toContain('space-x-3')
  })

  it('applies dark-mode prose variants to the status markdown', () => {
    const { container } = render(<ChannelStatusBar channelId="c1" statusText="**Bold** status" activePlayers={[]} isGM={false} onUpdate={vi.fn()} />)
    const prose = container.querySelector('.prose')!
    expect(prose).toHaveClass('text-amber-900', 'dark:text-amber-200')
    expect(prose).toHaveClass('dark:prose-p:text-amber-200')
    expect(prose).toHaveClass('dark:prose-strong:text-amber-200')
    expect(prose).not.toHaveClass('prose-amber')
  })

  it('allows GM to edit status', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    const mockOnUpdate = vi.fn()

    render(<ChannelStatusBar channelId="c1" statusText="Old status" activePlayers={[]} isGM={true} onUpdate={mockOnUpdate} />)

    fireEvent.click(screen.getByText('Edit'))
    
    const textarea = screen.getByDisplayValue('Old status')
    expect(textarea).toHaveAttribute('maxLength', '2000')
    fireEvent.change(textarea, { target: { value: 'New status' } })
    
    fireEvent.click(screen.getByText('Save Status'))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ status_text: 'New status' })
      expect(mockEq).toHaveBeenCalledWith('id', 'c1')
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('keeps the status editor text visible on dark backgrounds', () => {
    render(<ChannelStatusBar channelId="c1" statusText="Old status" activePlayers={[]} isGM={true} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Edit'))
    const textarea = screen.getByDisplayValue('Old status')
    expect(textarea).toHaveClass('bg-white', 'dark:bg-gray-800')
    expect(textarea).toHaveClass('text-gray-900', 'dark:text-gray-100')
  })

  it('cancels edit', () => {
    render(<ChannelStatusBar channelId="c1" statusText="Old status" activePlayers={[]} isGM={true} onUpdate={vi.fn()} />)

    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByText('Cancel'))
    
    expect(screen.queryByText('Save Status')).not.toBeInTheDocument()
    expect(screen.getByText('Old status')).toBeInTheDocument()
  })

  it('handles save error gracefully', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: new Error('DB Error') })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<ChannelStatusBar channelId="c1" statusText="Old status" activePlayers={[]} isGM={true} onUpdate={vi.fn()} />)

    fireEvent.click(screen.getByText('Edit'))
    fireEvent.click(screen.getByText('Save Status'))

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled()
      expect(screen.getByText('Failed to save status.')).toBeInTheDocument()
    })
  })
})

it('uses a brighter amber focus ring in dark mode while editing', () => {
  const { container } = render(<ChannelStatusBar channelId="c1" statusText="old" activePlayers={[]} isGM={true} onUpdate={vi.fn()} />)
  fireEvent.click(screen.getByText('Edit'))
  const input = container.querySelector('textarea')!
  expect(input).toHaveClass('focus:ring-amber-500')
  expect(input).toHaveClass('dark:focus:ring-amber-400')
  expect(input).toHaveClass('dark:focus:border-amber-400')
})
