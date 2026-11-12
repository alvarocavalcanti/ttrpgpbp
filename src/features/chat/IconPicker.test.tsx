import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IconPicker, toGameIconIds } from './IconPicker'
import { npcIconUrl } from './npcIcons'
import { reportAppError } from '../../lib/appErrorLog'

vi.mock('../../lib/appErrorLog', () => ({ reportAppError: vi.fn() }))

const reportMock = vi.mocked(reportAppError)

describe('toGameIconIds', () => {
  it('strips the game-icons namespace and keeps bare ids', () => {
    expect(toGameIconIds(['game-icons:dragon-head', 'goblin-head'])).toEqual({
      ids: ['dragon-head', 'goblin-head'],
      ignored: [],
    })
  })

  it('drops other collections and blank entries instead of stripping them', () => {
    expect(toGameIconIds(['mdi:sword', 'game-icons:', '', 42 as unknown as string])).toEqual({
      ids: [],
      ignored: ['mdi:sword'],
    })
  })
})

describe('IconPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the curated icon grid and picks one', () => {
    const onPick = vi.fn()
    render(<IconPicker onPick={onPick} onClose={vi.fn()} />)

    const btn = screen.getByRole('button', { name: 'wizard-face' })
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledWith(npcIconUrl('wizard-face'))
  })

  it('inverts game-icons in dark mode so they stay visible on dark backgrounds', () => {
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    const img = screen.getByRole('button', { name: 'wizard-face' }).querySelector('img')
    expect(img).toHaveClass('dark:invert')
  })

  it('names the dialog after its visible heading', () => {
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Choose NPC Portrait' })).toBeInTheDocument()
  })

  // The API returns collection-namespaced names ("game-icons:dragon-breath");
  // npcIconUrl expects the bare id. Uses an id absent from the curated grid so
  // the assertion cannot accidentally match the pre-search placeholder grid.
  it('renders search results without doubling the collection prefix', async () => {
    const onPick = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ icons: ['game-icons:dragon-breath'] }) }))
    render(<IconPicker onPick={onPick} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'breath' } })
    const btn = await screen.findByRole('button', { name: 'dragon-breath' })

    expect(screen.queryByRole('button', { name: 'wizard-face' })).not.toBeInTheDocument()
    expect(btn.querySelector('img')).toHaveAttribute('src', 'https://api.iconify.design/game-icons/dragon-breath.svg')
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledWith('https://api.iconify.design/game-icons/dragon-breath.svg')
    expect(reportMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('drops other collections and reports the mismatch once per page load', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ icons: ['game-icons:dragon-breath', 'mdi:sword'] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    try {
      render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
      const input = screen.getByLabelText('Search icons')

      fireEvent.change(input, { target: { value: 'dragon' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'dragon-breath' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'wizard-face' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'sword' })).not.toBeInTheDocument()

      fireEvent.change(input, { target: { value: 'drake' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }

    // Local warning fires every time, including the search term (never sent).
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenCalledWith(
      '[npc-icon-search] ignored non-game-icons results',
      expect.objectContaining({ query: 'dragon', ignored: 1, kept: 1, prefixes: ['mdi'] }),
    )

    // Durable report: one per page load, counts and prefixes only.
    expect(reportMock).toHaveBeenCalledTimes(1)
    const message = reportMock.mock.calls[0][0] as Error
    expect(message.message).toContain('[npc-icon-search] ignored 1 non-game-icons results')
    expect(message.message).toContain('prefixes: mdi')
    expect(message.message).toContain('kept 1')
    expect(message.message).not.toContain('dragon')
  })

  it('falls back to the curated grid and reports a malformed payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ total: 5 }) }))
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'dragon' } })

    await waitFor(() => {
      expect(reportMock).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('missing icons array'),
      }))
    })
    // Filtered curated fallback, not a blank panel.
    expect(screen.getByRole('button', { name: 'dragon-head' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'wizard-face' })).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('falls back to filtered curated icons when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'dragon' } })
    // The curated grid is filtered down to the query, so the grid being
    // replaced (wizard-face gone) — not just the matching button surviving —
    // proves the fallback ran rather than the initial grid still showing.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'wizard-face' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'dragon-head' })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('shows the empty state when the search returns no icons', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ icons: [] }) }))
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'zzzz' } })
    await waitFor(() => expect(screen.getByText('No icons found.')).toBeInTheDocument())
    vi.unstubAllGlobals()
  })

  it('ignores a superseded request instead of replacing live results', async () => {
    let rejectFirst: (reason: unknown) => void = () => {}
    const firstRequest = new Promise((_resolve, reject) => { rejectFirst = reject })
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstRequest)
      .mockImplementationOnce(() => Promise.resolve({ json: async () => ({ icons: ['game-icons:dragon-head'] }) }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    try {
      render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
      const input = screen.getByLabelText('Search icons')

      fireEvent.change(input, { target: { value: 'goblin' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      fireEvent.change(input, { target: { value: 'dragon' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      await act(async () => {
        rejectFirst(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        await Promise.resolve()
      })

      expect(screen.getByRole('button', { name: 'dragon-head' })).toBeInTheDocument()
      // The stale 'goblin' fallback would have replaced the grid.
      expect(screen.queryByRole('button', { name: 'goblin-head' })).not.toBeInTheDocument()
      expect(screen.queryByText('No icons found.')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('debounces search so rapid keystrokes fire one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ icons: ['game-icons:dragon-head'] }) })
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    try {
      render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

      const input = screen.getByLabelText('Search icons')
      fireEvent.change(input, { target: { value: 'dr' } })
      fireEvent.change(input, { target: { value: 'dra' } })
      fireEvent.change(input, { target: { value: 'dragon' } })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('query=dragon'), expect.anything())
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<IconPicker onPick={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
