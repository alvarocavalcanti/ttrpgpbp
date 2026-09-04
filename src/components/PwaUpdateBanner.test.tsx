import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { PwaUpdateBanner } from './PwaUpdateBanner'
import type { PwaUpdateStatus } from '../lib/pwaUpdate'

const mock = vi.hoisted(() => ({
  reloadToUpdate: vi.fn(),
  status: 'idle' as PwaUpdateStatus,
}))

vi.mock('../lib/pwaUpdate', () => ({
  reloadToUpdate: mock.reloadToUpdate,
  usePwaUpdate: () => mock.status,
}))

describe('PwaUpdateBanner', () => {
  it('renders nothing while idle', () => {
    mock.status = 'idle'
    render(<PwaUpdateBanner />)
    expect(screen.queryByTestId('pwa-update-banner')).not.toBeInTheDocument()
  })

  it('renders nothing on first-install offline-ready', () => {
    mock.status = 'offline-ready'
    render(<PwaUpdateBanner />)
    expect(screen.queryByTestId('pwa-update-banner')).not.toBeInTheDocument()
  })

  it('shows the reload prompt when a new version is available', () => {
    mock.status = 'update-available'
    render(<PwaUpdateBanner />)
    expect(screen.getByTestId('pwa-update-banner')).toHaveTextContent('New version available, reload to update.')
  })

  it('reloads the app when the CTA is tapped', () => {
    mock.status = 'update-available'
    render(<PwaUpdateBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(mock.reloadToUpdate).toHaveBeenCalledTimes(1)
  })
})