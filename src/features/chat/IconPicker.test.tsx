import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { IconPicker } from './IconPicker'
import { npcIconUrl } from './npcIcons'

describe('IconPicker', () => {
  it('shows the curated icon grid and picks one', () => {
    const onPick = vi.fn()
    render(<IconPicker onPick={onPick} onClose={vi.fn()} />)

    const btn = screen.getByRole('button', { name: 'wizard-face' })
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledWith(npcIconUrl('wizard-face'))
  })

  it('searches the Iconify API and falls back on failure', async () => {
    const onPick = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ icons: ['dragon-head'] }) }))
    render(<IconPicker onPick={onPick} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'dragon' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'dragon-head' })).toBeInTheDocument()
    })
    vi.unstubAllGlobals()
  })

  it('falls back to filtered curated icons when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'dragon' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'dragon-head' })).toBeInTheDocument()
    })
    vi.unstubAllGlobals()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<IconPicker onPick={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
