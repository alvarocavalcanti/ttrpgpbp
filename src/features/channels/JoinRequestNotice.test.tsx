import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { JoinRequestNotice } from './JoinRequestNotice'
import type { JoinRequestDecision } from './useMyJoinRequestDecisions'

const approved: JoinRequestDecision = {
  id: 'r1',
  channel_id: 'c1',
  channel_name: 'Sunless Citadel',
  status: 'approved',
  decided_at: '2026-10-15T10:00:00Z',
}

const rejected: JoinRequestDecision = {
  id: 'r2',
  channel_id: 'c2',
  channel_name: 'Tomb of Horrors',
  status: 'rejected',
  decided_at: '2026-10-15T11:00:00Z',
}

function renderNotice(decisions: JoinRequestDecision[], onDismiss = vi.fn()) {
  render(
    <MemoryRouter>
      <JoinRequestNotice decisions={decisions} onDismiss={onDismiss} />
    </MemoryRouter>,
  )
  return onDismiss
}

describe('JoinRequestNotice', () => {
  it('renders nothing without decisions', () => {
    renderNotice([])
    expect(screen.queryByTestId('join-request-notice')).not.toBeInTheDocument()
  })

  it('announces an approval, links into the channel, and clears itself on open', () => {
    const onDismiss = renderNotice([approved])

    expect(screen.getByTestId('join-request-notice')).toHaveTextContent("You're in — Sunless Citadel")
    const open = screen.getByRole('link', { name: 'Open channel' })
    expect(open).toHaveAttribute('href', '/channel/c1')

    fireEvent.click(open)
    expect(onDismiss).toHaveBeenCalledWith('r1')
  })

  it('announces a rejection without offering the channel', () => {
    renderNotice([rejected])

    expect(screen.getByTestId('join-request-notice')).toHaveTextContent('Your application to Tomb of Horrors was declined.')
    expect(screen.queryByRole('link', { name: 'Open channel' })).not.toBeInTheDocument()
  })

  it('dismisses each outcome', () => {
    const onDismiss = renderNotice([approved, rejected])

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the decision for Tomb of Horrors' }))
    expect(onDismiss).toHaveBeenCalledWith('r2')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the good news about Sunless Citadel' }))
    expect(onDismiss).toHaveBeenCalledWith('r1')
  })
})
