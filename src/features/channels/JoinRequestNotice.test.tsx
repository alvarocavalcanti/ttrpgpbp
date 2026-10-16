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
  is_member: true,
}

const declined: JoinRequestDecision = {
  id: 'r2',
  channel_id: 'c2',
  channel_name: 'Tomb of Horrors',
  status: 'rejected',
  decided_at: '2026-10-15T11:00:00Z',
  is_member: false,
}

// Approved, but the membership is gone (removed, blocked, or left since).
const approvedWithoutAccess: JoinRequestDecision = {
  ...approved,
  id: 'r3',
  channel_name: 'Sunken Crypt',
  is_member: false,
}

function renderNotice(decisions: JoinRequestDecision[], onDismiss = vi.fn(), error: Error | null = null, onRetry = vi.fn()) {
  render(
    <MemoryRouter>
      <JoinRequestNotice decisions={decisions} error={error} onRetry={onRetry} onDismiss={onDismiss} />
    </MemoryRouter>,
  )
  return { onDismiss, onRetry }
}

describe('JoinRequestNotice', () => {
  it('renders nothing without decisions', () => {
    renderNotice([])
    expect(screen.queryByTestId('join-request-notice')).not.toBeInTheDocument()
  })

  it('says so, with a retry, when the decisions could not be loaded', () => {
    const { onRetry } = renderNotice([], undefined, new Error('down'))

    expect(screen.getByTestId('join-request-notice-error')).toHaveTextContent("Could not check your applications.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('keeps the decisions and hides the error once one loaded', () => {
    renderNotice([approved], undefined, new Error('down'))

    expect(screen.getByTestId('join-request-notice')).toBeInTheDocument()
    expect(screen.queryByTestId('join-request-notice-error')).not.toBeInTheDocument()
  })

  it('announces an approval, links into the channel, and clears itself on open', () => {
    const { onDismiss } = renderNotice([approved])

    expect(screen.getByTestId('join-request-notice')).toHaveTextContent("You're in — Sunless Citadel")
    const open = screen.getByRole('link', { name: 'Open channel' })
    expect(open).toHaveAttribute('href', '/channel/c1')

    fireEvent.click(open)
    expect(onDismiss).toHaveBeenCalledWith('r1')
  })

  it('reports an approval whose access is gone without offering the channel', () => {
    renderNotice([approvedWithoutAccess])

    expect(screen.getByTestId('join-request-notice')).toHaveTextContent('You were accepted to Sunken Crypt, and you are not in it now.')
    expect(screen.queryByRole('link', { name: 'Open channel' })).not.toBeInTheDocument()
  })

  it('announces a rejection without offering the channel', () => {
    renderNotice([declined])

    expect(screen.getByTestId('join-request-notice')).toHaveTextContent('Your application to Tomb of Horrors was declined.')
    expect(screen.queryByRole('link', { name: 'Open channel' })).not.toBeInTheDocument()
  })

  it('dismisses each outcome', () => {
    const { onDismiss } = renderNotice([approved, declined, approvedWithoutAccess])

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the decision for Tomb of Horrors' }))
    expect(onDismiss).toHaveBeenCalledWith('r2')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the decision for Sunken Crypt' }))
    expect(onDismiss).toHaveBeenCalledWith('r3')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss the good news about Sunless Citadel' }))
    expect(onDismiss).toHaveBeenCalledWith('r1')
  })
})
