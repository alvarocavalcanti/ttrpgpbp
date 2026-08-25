import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '../../contexts/ToastContext'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NpcManagementModal } from './NpcManagementModal'
import { useChannelNpcs } from './useChannelNpcs'
import { useImageUpload } from '../../hooks/useImageUpload'

vi.mock('./useChannelNpcs', () => ({
  useChannelNpcs: vi.fn()
}))

vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: vi.fn()
}))

vi.mock('../chat/IconPicker', () => ({
  IconPicker: ({ onPick, onClose }: any) => (
    <div data-testid="icon-picker">
      <button type="button" onClick={() => onPick('https://icon/new.svg')}>Pick New Icon</button>
      <button type="button" onClick={onClose}>Close Picker</button>
    </div>
  )
}))

const baseNpcs = [
  { id: 'n1', channel_id: 'c1', name: 'Goblin King', avatar_url: 'https://icon/goblin.svg', created_at: '2026-01-01' },
  { id: 'n2', channel_id: 'c1', name: 'Dragon', avatar_url: 'https://icon/dragon.svg', created_at: '2026-01-02' },
]

describe('NpcManagementModal', () => {
  const onUpdate = vi.fn()
  const onClose = vi.fn()

  const mockHook = (overrides: Partial<ReturnType<typeof useChannelNpcs>> = {}) => {
    const base = {
      npcs: baseNpcs,
      loading: false,
      refetch: vi.fn(),
      addNpc: vi.fn(),
      createNpc: vi.fn().mockResolvedValue(true),
      renameNpc: vi.fn().mockResolvedValue(true),
      repictureNpc: vi.fn().mockResolvedValue(true),
      deleteNpc: vi.fn().mockResolvedValue(true),
    }
    vi.mocked(useChannelNpcs).mockReturnValue({ ...base, ...overrides } as any)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useImageUpload).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadImage: vi.fn().mockResolvedValue('https://icon/uploaded.svg'),
    } as any)
    mockHook()
  })

  it('renders the roster with names and portraits', () => {
    const { container } = render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    expect(screen.getByText('Goblin King')).toBeInTheDocument()
    expect(screen.getByText('Dragon')).toBeInTheDocument()
    expect(container.querySelectorAll('img').length).toBe(2)
    expect(container.querySelector('img[class*="dark:invert"]')).toBeNull()
  })

  it('inverts game-icons roster portraits but not uploaded ones', () => {
    mockHook({
      npcs: [
        { id: 'n1', channel_id: 'c1', name: 'Goblin King', avatar_url: 'https://api.iconify.design/game-icons/goblin-head.svg', created_at: '2026-01-01' },
        { id: 'n2', channel_id: 'c1', name: 'Dragon', avatar_url: 'https://icon/dragon.svg', created_at: '2026-01-02' },
      ],
    })
    const { container } = render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    const inverted = container.querySelector('img[class*="dark:invert"]')
    expect(inverted?.getAttribute('src')).toBe('https://api.iconify.design/game-icons/goblin-head.svg')
    expect(container.querySelector('img[src="https://icon/dragon.svg"]')).not.toHaveClass('dark:invert')
  })

  it('shows an empty state when no NPCs exist', () => {
    mockHook({ npcs: [] })
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    expect(screen.getByText(/No NPCs yet/)).toBeInTheDocument()
  })

  it('renames an NPC on save', async () => {
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    fireEvent.click(screen.getByLabelText('Rename Goblin King'))
    const input = screen.getByLabelText('NPC name') as HTMLInputElement
    expect(input).toHaveAttribute('maxLength', '40')
    fireEvent.change(input, { target: { value: 'Goblin Prince' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(vi.mocked(useChannelNpcs).mock.results[0].value.renameNpc).toHaveBeenCalledWith('n1', 'Goblin Prince')
    })
  })

  it('deletes an NPC after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    fireEvent.click(screen.getByLabelText('Delete Goblin King'))
    await waitFor(() => {
      expect(vi.mocked(useChannelNpcs).mock.results[0].value.deleteNpc).toHaveBeenCalledWith('n1')
    })
  })

  it('does not delete when confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    fireEvent.click(screen.getByLabelText('Delete Goblin King'))
    expect(vi.mocked(useChannelNpcs).mock.results[0].value.deleteNpc).not.toHaveBeenCalled()
  })

  it('adds a new NPC', async () => {
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    const input = screen.getByLabelText('New NPC name') as HTMLInputElement
    expect(input).toHaveAttribute('maxLength', '40')
    fireEvent.change(input, { target: { value: 'Orc Warlord' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() => {
      const { createNpc } = vi.mocked(useChannelNpcs).mock.results[0].value
      expect(createNpc).toHaveBeenCalled()
      const [, avatar] = (createNpc as any).mock.calls[0]
      expect(avatar).toMatch(/^https:\/\/api\.iconify\.design\/game-icons\//)
    })
  })

  it('rejects an empty new NPC name', async () => {
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    fireEvent.click(screen.getByText('Add'))
    expect(vi.mocked(useChannelNpcs).mock.results[0].value.createNpc).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByText('Enter a name for the NPC.')).toBeInTheDocument()
    })
  })

  it('repictures an NPC from the icon picker', async () => {
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    fireEvent.click(screen.getByLabelText('Choose portrait for Goblin King'))
    expect(screen.getByTestId('icon-picker')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Pick New Icon'))
    await waitFor(() => {
      expect(vi.mocked(useChannelNpcs).mock.results[0].value.repictureNpc).toHaveBeenCalledWith('n1', 'https://icon/new.svg')
    })
  })

  it('closes on backdrop click', () => {
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    fireEvent.click(screen.getByRole('dialog').previousElementSibling!)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a loading state', () => {
    mockHook({ loading: true })
    render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('applies dark-mode surface classes to surfaces, rows, and inputs', () => {
    const { container } = render(<ToastProvider><NpcManagementModal channelId="c1" onClose={onClose} onUpdate={onUpdate} /></ToastProvider>)
    expect(screen.getByRole('dialog')).toHaveClass('bg-white', 'dark:bg-gray-800')
    const row = container.querySelector('li')!
    expect(row).toHaveClass('dark:bg-gray-900')
    expect(screen.getByLabelText('New NPC name')).toHaveClass('dark:bg-gray-800')
    expect(screen.getByText('Goblin King')).toHaveClass('dark:text-gray-100')
  })
})
