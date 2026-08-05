import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ArchivedChannels } from './ArchivedChannels'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('ArchivedChannels', () => {
  it('renders correctly', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq1 }) } as any)

    render(<ArchivedChannels />, { wrapper: MemoryRouter })
    await waitFor(() => expect(screen.getByText('No archived channels found.')).toBeInTheDocument())
  })

  it('handles restore', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    const mockOrder = vi.fn().mockResolvedValue({ data: [{ id: '1', name: 'Archived', created_at: '2023-01-01' }], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
    
    vi.mocked(supabase.from).mockReturnValue({ 
      select: vi.fn().mockReturnValue({ eq: mockEq1 }),
      update: mockUpdate
    } as any)

    render(<ArchivedChannels />, { wrapper: MemoryRouter })
    await waitFor(() => expect(screen.getByText('Archived')).toBeInTheDocument())
    
    
    fireEvent.click(screen.getByText('Restore'))
    
    await waitFor(() => {
      expect(mockUpdateEq).toHaveBeenCalledWith('id', '1')
      expect(screen.getByText('No archived channels found.')).toBeInTheDocument()
    })
  })

})
