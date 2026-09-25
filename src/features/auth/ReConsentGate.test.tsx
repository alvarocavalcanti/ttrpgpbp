import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ReConsentGate } from './ReConsentGate'

describe('ReConsentGate', () => {
  it('renders the update prompt with the previously accepted version', () => {
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={vi.fn()} previousVersion="2026-09-21" />
      </MemoryRouter>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Our Terms and Privacy Policy have changed')).toBeInTheDocument()
    expect(screen.getByText(/You last accepted version 2026-09-21\./)).toBeInTheDocument()
    expect(screen.getByText(/Please review and accept version 2026-09-24 to keep using Role by Post\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('button', { name: /I accept the updated Terms \(v2026-09-24\)/ })).toBeInTheDocument()
  })

  it('omits the previously accepted version when none was recorded', () => {
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={vi.fn()} previousVersion={null} />
      </MemoryRouter>
    )

    expect(screen.getByText('Our Terms and Privacy Policy have changed')).toBeInTheDocument()
    expect(screen.queryByText(/You last accepted version/)).not.toBeInTheDocument()
    expect(screen.getByText(/Please review and accept version 2026-09-24 to keep using Role by Post\./)).toBeInTheDocument()
  })

  it('calls onAccept when the user agrees', async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined)
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={onAccept} previousVersion="2026-09-21" />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /I accept the updated Terms/ }))

    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1)
    })
  })

  it('shows an inline error when recording the acceptance fails', async () => {
    const onAccept = vi.fn().mockRejectedValue(new Error('offline'))
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={onAccept} previousVersion="2026-09-21" />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /I accept the updated Terms/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not record your acceptance. Please try again.')
  })

  it('disables the button while recording', async () => {
    let resolveAccept!: () => void
    const onAccept = vi.fn().mockImplementation(() => new Promise<void>(r => { resolveAccept = r }))
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={onAccept} previousVersion="2026-09-21" />
      </MemoryRouter>
    )

    const button = screen.getByRole('button', { name: /I accept the updated Terms/ })
    fireEvent.click(button)
    expect(button).toBeDisabled()

    resolveAccept()
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })
})
