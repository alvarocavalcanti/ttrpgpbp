import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ArchivedChannels } from './ArchivedChannels'
import { useAuth } from '../auth/useAuth'
import { useArchivedChannels } from './useArchivedChannels'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'

function BackProbe() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)} data-testid="back-probe">
      back
    </button>
  )
}

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))
vi.mock('./useArchivedChannels', () => ({
  useArchivedChannels: vi.fn()
}))

const mockRestoreChannel = vi.fn()

const mockHook = ({ archivedChannels = [], loading = false, error = null }:
  { archivedChannels?: any[], loading?: boolean, error?: string | null } = {}) => {
  vi.mocked(useArchivedChannels).mockReturnValue({
    archivedChannels,
    loading,
    error,
    restoreChannel: mockRestoreChannel
  } as any)
}

function renderWithHook({ archived = false } = {}) {
  mockHook(archived ? { archivedChannels: [{ id: '1', name: 'Archived', created_at: '2023-01-01' }] } : {})
  return render(<ArchivedChannels />, { wrapper: MemoryRouter })
}

describe('ArchivedChannels', () => {
  it('renders correctly', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    mockHook({ archivedChannels: [{ id: '1', name: 'Archived', created_at: '2023-01-01' }] })

    render(<ArchivedChannels />, { wrapper: MemoryRouter })
    await waitFor(() => expect(screen.getByText('Archived')).toBeInTheDocument())
  })

  it('shows an empty state when there are no archived channels', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    mockHook()

    render(<ArchivedChannels />, { wrapper: MemoryRouter })
    await waitFor(() => expect(screen.getByText('No archived channels found.')).toBeInTheDocument())
  })

  it('shows an error banner when the fetch fails', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    mockHook({ error: 'Failed to load archived channels.' })

    render(<ArchivedChannels />, { wrapper: MemoryRouter })

    await waitFor(() => {
      expect(screen.getByText('Failed to load archived channels.')).toBeInTheDocument()
    })
  })

  it('handles restore', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    const { rerender } = renderWithHook({ archived: true })

    fireEvent.click(screen.getByText('Restore'))
    await waitFor(() => expect(mockRestoreChannel).toHaveBeenCalledWith('1'))

    // Hook clears the restored row; the page shows the empty state.
    mockHook()
    rerender(<ArchivedChannels />)
    await waitFor(() => expect(screen.getByText('No archived channels found.')).toBeInTheDocument())
  })

  it('shows the restore error from the hook', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    mockHook({
      archivedChannels: [{ id: '1', name: 'Archived', created_at: '2023-01-01' }],
      error: 'Failed to restore channel.'
    })

    render(<ArchivedChannels />, { wrapper: MemoryRouter })

    await waitFor(() => {
      expect(screen.getByText('Failed to restore channel.')).toBeInTheDocument()
    })
  })

  it('replaces the entry when returning to lobby so back does not re-enter the page', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    mockHook()

    render(
      <MemoryRouter initialEntries={['/archived']}>
        <Routes>
          <Route path="/archived" element={<ArchivedChannels />} />
          <Route path="/" element={<BackProbe />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('No archived channels found.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('link', { name: 'Back to Lobby' }))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('back-probe'))
    expect(screen.getByTestId('back-probe')).toBeInTheDocument()
  })
})
