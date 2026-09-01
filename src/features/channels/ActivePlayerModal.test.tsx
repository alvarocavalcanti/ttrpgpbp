import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ActivePlayerModal } from './ActivePlayerModal'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn() }
}))

describe('ActivePlayerModal', () => {
  const members: any[] = [
    { id: 'm1', user_id: 'u1', character_name: 'Hero', profile: { display_name: 'P1' } },
    { id: 'm2', user_id: 'u2', character_name: 'Archer', profile: { display_name: 'P2' } },
  ]

  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset()
  })

  it('renders members with character and display names', () => {
    render(<ActivePlayerModal channelId="c1" members={members} currentActiveIds={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByText('Hero')).toBeInTheDocument()
    expect(screen.getByText('P1')).toBeInTheDocument()
    expect(screen.getByText('Archer')).toBeInTheDocument()
    expect(screen.getByText('P2')).toBeInTheDocument()
  })

  it('pre-checks the currently active players', () => {
    render(<ActivePlayerModal channelId="c1" members={members} currentActiveIds={['u1']} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: /Hero/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Archer/ })).not.toBeChecked()
  })

  it('toggles selection and saves the new active players via the RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as any)
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(<ActivePlayerModal channelId="c1" members={members} currentActiveIds={[]} onClose={onClose} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /Hero/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Archer/ }))
    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('set_active_players', {
        p_channel_id: 'c1',
        p_active_player_ids: ['u1', 'u2'],
      })
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows an error and keeps the modal open when the RPC returns an error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ error: new Error('denied') } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onClose = vi.fn()
    render(<ActivePlayerModal channelId="c1" members={members} currentActiveIds={[]} onClose={onClose} onSaved={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Save/i }))

    await screen.findByRole('alert')
    expect(screen.getByText('Failed to save active players.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('retries the save from the error state', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ error: new Error('denied') } as any)
      .mockResolvedValueOnce({ error: null } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onSaved = vi.fn()
    render(<ActivePlayerModal channelId="c1" members={members} currentActiveIds={['u1']} onClose={vi.fn()} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('button', { name: /Save/i }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
      expect(supabase.rpc).toHaveBeenCalledTimes(2)
    })
  })

  it('shows an empty state when there are no members', () => {
    render(<ActivePlayerModal channelId="c1" members={[]} currentActiveIds={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByText('No other players in this channel yet.')).toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<ActivePlayerModal channelId="c1" members={members} currentActiveIds={[]} onClose={onClose} onSaved={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('traps focus inside the dialog', () => {
    render(<ActivePlayerModal channelId="c1" members={members} currentActiveIds={[]} onClose={vi.fn()} onSaved={vi.fn()} />)
    // Initial focus moves into the dialog (close button is first focusable)
    // and Tab wraps back to it from the last focusable element.
    expect(screen.getByLabelText('Close active player')).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(screen.getByLabelText('Close active player')).toHaveFocus()
  })
})