import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ReConsentGate } from './ReConsentGate'

describe('ReConsentGate', () => {
  it('renders the re-acceptance prompt with links to both policies', () => {
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/updated our Terms/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('button', { name: /I agree to the Terms \(v2026-09-21\)/ })).toBeInTheDocument()
  })

  it('calls onAccept when the user agrees', async () => {
    const onAccept = vi.fn().mockResolvedValue(undefined)
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={onAccept} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /I agree to the Terms/ }))

    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledTimes(1)
    })
  })

  it('shows an inline error when recording the acceptance fails', async () => {
    const onAccept = vi.fn().mockRejectedValue(new Error('offline'))
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={onAccept} />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /I agree to the Terms/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not record your acceptance. Please try again.')
  })

  it('disables the button while recording', async () => {
    let resolveAccept!: () => void
    const onAccept = vi.fn().mockImplementation(() => new Promise<void>(r => { resolveAccept = r }))
    render(
      <MemoryRouter>
        <ReConsentGate onAccept={onAccept} />
      </MemoryRouter>
    )

    const button = screen.getByRole('button', { name: /I agree to the Terms/ })
    fireEvent.click(button)
    expect(button).toBeDisabled()

    resolveAccept()
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })
})
