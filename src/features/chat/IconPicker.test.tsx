import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IconPicker, toGameIconIds, fetchIconSources } from './IconPicker'
import { CURATED_NPC_ICONS, npcIconUrl } from './npcIcons'
import { ICON_BODY_CACHE_KEY } from './iconSourceCache'
import { reportAppError } from '../../lib/appErrorLog'

vi.mock('../../lib/appErrorLog', () => ({ reportAppError: vi.fn() }))

const reportMock = vi.mocked(reportAppError)

const BODY = '<path fill="currentColor" d="M0 0"/>'

interface StubOptions {
  /** One entry per search call; the last one repeats. */
  searchResults?: string[][]
  /** Ids the collection endpoint answers with a body. Defaults to every id. */
  missingIds?: string[]
  /** Make the collection request fail like an offline client. */
  collectionFails?: boolean
}

// Every request goes through the router: an unexpected URL (in particular a
// per-icon .svg image request — the #835 bug) fails the test instead of
// silently passing.
function stubIconifyFetch(options: StubOptions = {}) {
  const calls: string[] = []
  const fetchedIdSets: string[][] = []
  const queue = [...(options.searchResults ?? [['game-icons:dragon-head']])]

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/search?')) {
      const icons = queue.length > 1 ? queue.shift()! : queue[0]
      return { ok: true, json: async () => ({ icons }) }
    }
    if (url.includes('/game-icons.json?')) {
      if (options.collectionFails) throw new Error('network')
      const ids = (new URL(url).searchParams.get('icons') ?? '').split(',').filter(Boolean)
      fetchedIdSets.push(ids)
      const icons: Record<string, { body: string }> = {}
      for (const id of ids) {
        if (!options.missingIds?.includes(id)) icons[id] = { body: BODY }
      }
      return { ok: true, json: async () => ({ width: 512, height: 512, icons }) }
    }
    throw new Error(`Unexpected fetch: ${url}`)
  })

  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    calls,
    fetchedIdSets,
    searchCalls: () => calls.filter(url => url.includes('/search?')),
    collectionCalls: () => calls.filter(url => url.includes('/game-icons.json')),
  }
}

function warmCache() {
  const sources: Record<string, { body: string; size: number }> = {}
  for (const id of CURATED_NPC_ICONS) sources[id] = { body: BODY, size: 512 }
  localStorage.setItem(ICON_BODY_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), sources }))
}

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

describe('fetchIconSources', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for nothing when there is nothing to fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchIconSources([])).resolves.toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips icons the payload has no body for', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ width: 512, height: 512, icons: { 'dragon-head': { body: BODY } } }),
    })))

    await expect(fetchIconSources(['dragon-head', 'ghost'])).resolves.toEqual({
      'dragon-head': { body: BODY, size: 512 },
    })
  })

  it('uses the icon size when the collection does not declare one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ icons: { 'dragon-head': { body: BODY, width: 24 } } }),
    })))

    await expect(fetchIconSources(['dragon-head'])).resolves.toEqual({
      'dragon-head': { body: BODY, size: 24 },
    })
  })
})

describe('IconPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows the curated icon grid and picks one', async () => {
    stubIconifyFetch()
    const onPick = vi.fn()
    render(<IconPicker onPick={onPick} onClose={vi.fn()} />)

    const btn = await screen.findByRole('button', { name: 'wizard-face' })
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledWith(npcIconUrl('wizard-face'))
  })

  it('inverts game-icons in dark mode so they stay visible on dark backgrounds', async () => {
    stubIconifyFetch()
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    const btn = await screen.findByRole('button', { name: 'wizard-face' })
    expect(btn.querySelector('img')).toHaveClass('dark:invert')
  })

  it('names the dialog after its visible heading', () => {
    stubIconifyFetch()
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Choose NPC Portrait' })).toBeInTheDocument()
  })

  // The API returns collection-namespaced names ("game-icons:dragon-breath");
  // npcIconUrl expects the bare id. Uses an id absent from the curated grid so
  // the assertion cannot accidentally match the pre-search placeholder grid.
  it('renders search results without doubling the collection prefix', async () => {
    stubIconifyFetch({ searchResults: [['game-icons:dragon-breath']] })
    const onPick = vi.fn()
    render(<IconPicker onPick={onPick} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'breath' } })
    const btn = await screen.findByRole('button', { name: 'dragon-breath' })

    expect(screen.queryByRole('button', { name: 'wizard-face' })).not.toBeInTheDocument()
    expect(btn.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledWith('https://api.iconify.design/game-icons/dragon-breath.svg')
    expect(reportMock).not.toHaveBeenCalled()
  })

  it('drops other collections and reports the mismatch once per page load', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { searchCalls } = stubIconifyFetch({
      searchResults: [['game-icons:dragon-breath', 'mdi:sword']],
    })
    vi.useFakeTimers()
    try {
      render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
      const input = screen.getByLabelText('Search icons')

      fireEvent.change(input, { target: { value: 'dragon' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })

      expect(searchCalls()).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'dragon-breath' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'wizard-face' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'sword' })).not.toBeInTheDocument()

      fireEvent.change(input, { target: { value: 'drake' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      expect(searchCalls()).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }

    // Local warning fires every time, without the search term: Sentry turns
    // console output into breadcrumbs attached to the reported error event.
    expect(warnSpy).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenCalledWith(
      '[npc-icon-search] ignored non-game-icons results',
      expect.objectContaining({ ignored: 1, kept: 1, prefixes: ['mdi'] }),
    )
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('dragon')

    // Durable report: one per page load, counts and prefixes only.
    expect(reportMock).toHaveBeenCalledTimes(1)
    const message = reportMock.mock.calls[0][0] as Error
    expect(message.message).toContain('[npc-icon-search] ignored 1 non-game-icons results')
    expect(message.message).toContain('prefixes: mdi')
    expect(message.message).toContain('kept 1')
    expect(message.message).not.toContain('dragon')
  })

  it('falls back to the curated grid and reports a malformed payload', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/search?')) return { json: async () => ({ total: 5 }) }
      if (url.includes('/game-icons.json?')) {
        return { json: async () => ({ width: 512, height: 512, icons: { 'dragon-head': { body: BODY } } }) }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: 'wizard-face' })

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'dragon' } })

    await waitFor(() => {
      expect(reportMock).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('missing icons array'),
      }))
    })
    // Filtered curated fallback, not a blank panel.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'wizard-face' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'dragon-head' })).toBeInTheDocument()

    // A second malformed search must not file a second durable report: the
    // RPC budget is one row per failure kind per page load.
    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'ogre' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ogre' })).toBeInTheDocument()
    })
    expect(reportMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to filtered curated icons when the search API fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/search?')) throw new Error('network')
      if (url.includes('/game-icons.json?')) {
        const ids = (new URL(url).searchParams.get('icons') ?? '').split(',').filter(Boolean)
        const icons: Record<string, { body: string }> = {}
        for (const id of ids) icons[id] = { body: BODY }
        return { json: async () => ({ width: 512, height: 512, icons }) }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
    // Anchor on the full curated grid first, so "wizard-face is gone" can only
    // mean the fallback replaced it.
    await screen.findByRole('button', { name: 'wizard-face' })

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'dragon' } })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'wizard-face' })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'dragon-head' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/search?'))).toBe(true)
  })

  it('shows the empty state when the search returns no icons', async () => {
    const { collectionCalls } = stubIconifyFetch({ searchResults: [[]] })
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'zzzz' } })
    await waitFor(() => expect(screen.getByText('No icons found.')).toBeInTheDocument())
    // Nothing displayed to fetch bodies for, so no wasted request.
    expect(collectionCalls().some(url => url.includes('icons=&') || url.endsWith('icons='))).toBe(false)
  })

  it('ignores a superseded request instead of replacing live results', async () => {
    let rejectFirst: (reason: unknown) => void = () => {}
    const firstSearch = new Promise((_resolve, reject) => { rejectFirst = reject })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/search?')) {
        if (url.includes('query=goblin')) return firstSearch
        return { json: async () => ({ icons: ['game-icons:dragon-head'] }) }
      }
      if (url.includes('/game-icons.json?')) {
        const ids = (new URL(url).searchParams.get('icons') ?? '').split(',').filter(Boolean)
        const icons: Record<string, { body: string }> = {}
        for (const id of ids) icons[id] = { body: BODY }
        return { json: async () => ({ width: 512, height: 512, icons }) }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
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
    }
  })

  it('ignores a superseded search that resolves late', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    const firstSearch = new Promise(resolve => { resolveFirst = resolve })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/search?')) {
        if (url.includes('query=goblin')) return firstSearch
        return { json: async () => ({ icons: ['game-icons:dragon-head'] }) }
      }
      if (url.includes('/game-icons.json?')) {
        const ids = (new URL(url).searchParams.get('icons') ?? '').split(',').filter(Boolean)
        const icons: Record<string, { body: string }> = {}
        for (const id of ids) icons[id] = { body: BODY }
        return { json: async () => ({ width: 512, height: 512, icons }) }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    try {
      render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
      const input = screen.getByLabelText('Search icons')

      fireEvent.change(input, { target: { value: 'goblin' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      fireEvent.change(input, { target: { value: 'dragon' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })

      // The first request ignored its abort signal and lands after the second
      // committed; its results must not replace the live ones.
      await act(async () => {
        resolveFirst({ json: async () => ({ icons: ['game-icons:goblin-head'] }) })
        await Promise.resolve()
      })

      expect(screen.getByRole('button', { name: 'dragon-head' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'goblin-head' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a batch that lands after the query changed', async () => {
    let resolveAnvilBatch: (value: unknown) => void = () => {}
    const anvilBatch = new Promise(resolve => { resolveAnvilBatch = resolve })
    const collection = (ids: string[]) => {
      const icons: Record<string, { body: string }> = {}
      for (const id of ids) icons[id] = { body: BODY }
      return { json: async () => ({ width: 512, height: 512, icons }) }
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/search?')) {
        return { json: async () => ({ icons: [url.includes('query=anvil') ? 'game-icons:anvil' : 'game-icons:visored-helm'] }) }
      }
      if (url.includes('/game-icons.json?')) {
        const ids = (new URL(url).searchParams.get('icons') ?? '').split(',').filter(Boolean)
        return ids.includes('anvil') ? anvilBatch : collection(ids)
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
    try {
      render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
      const input = screen.getByLabelText('Search icons')

      fireEvent.change(input, { target: { value: 'anvil' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })
      fireEvent.change(input, { target: { value: 'helm' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(300) })

      await act(async () => {
        resolveAnvilBatch(collection(['anvil']))
        await Promise.resolve()
      })

      expect(screen.getByRole('button', { name: 'visored-helm' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'anvil' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('debounces search so rapid keystrokes fire one request', async () => {
    const { searchCalls } = stubIconifyFetch({ searchResults: [['game-icons:dragon-head']] })
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

      const searches = searchCalls()
      expect(searches).toHaveLength(1)
      expect(searches[0]).toContain('query=dragon')
    } finally {
      vi.useRealTimers()
    }
  })

  // The bug in #835: every search requested up to 48 .svg images, so the second
  // one tripped Iconify's burst limiter and every tile came back 429.
  it('keeps previews working across consecutive searches without image requests', async () => {
    // Ids absent from the curated grid, so findByRole cannot match the
    // placeholder grid that is still on screen when the search starts.
    const { calls } = stubIconifyFetch({
      searchResults: [['game-icons:anvil'], ['game-icons:visored-helm']],
    })
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByLabelText('Search icons')

    fireEvent.change(input, { target: { value: 'anvil' } })
    const first = await screen.findByRole('button', { name: 'anvil' })
    expect(first.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)

    fireEvent.change(input, { target: { value: 'helm' } })
    const second = await screen.findByRole('button', { name: 'visored-helm' })
    expect(second.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(screen.queryByRole('button', { name: 'anvil' })).not.toBeInTheDocument()

    expect(calls.filter(url => url.endsWith('.svg'))).toEqual([])
  })

  it('requests the whole displayed set once, with bare ids', async () => {
    const { fetchedIdSets, collectionCalls } = stubIconifyFetch({
      searchResults: [['game-icons:dragon-breath', 'game-icons:anvil']],
    })
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: 'wizard-face' })
    const mountBatches = collectionCalls().length

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'breath' } })
    await screen.findByRole('button', { name: 'dragon-breath' })

    expect(collectionCalls()).toHaveLength(mountBatches + 1)
    expect(fetchedIdSets.at(-1)).toEqual(['dragon-breath', 'anvil'])
    const searchBatch = collectionCalls().at(-1)!
    expect(searchBatch).not.toContain('game-icons%3A')
    expect(searchBatch).not.toContain('game-icons:')
  })

  it('falls back to plain image URLs when the collection request fails', async () => {
    stubIconifyFetch({ collectionFails: true })
    const onPick = vi.fn()
    render(<IconPicker onPick={onPick} onClose={vi.fn()} />)

    const btn = await screen.findByRole('button', { name: 'wizard-face' })
    expect(btn.querySelector('img')).toHaveAttribute('src', npcIconUrl('wizard-face'))
    fireEvent.click(btn)
    expect(onPick).toHaveBeenCalledWith(npcIconUrl('wizard-face'))
  })

  // Curated bodies live in local storage for a week, so a warm picker needs no
  // request at all — the defaults can never break during a rate-limit window.
  it('paints the curated grid from the cache without any request', async () => {
    warmCache()
    const { fetchMock } = stubIconifyFetch()
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)

    // getByRole is synchronous: the grid painted on the first render, with no
    // spinner and nothing asked of the network.
    const btn = screen.getByRole('button', { name: 'wizard-face' })
    expect(btn.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores curated bodies only, never the displayed search set', async () => {
    stubIconifyFetch({
      searchResults: [['game-icons:dragon-breath', 'not-a-curated-icon']],
    })
    render(<IconPicker onPick={vi.fn()} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: 'wizard-face' })

    fireEvent.change(screen.getByLabelText('Search icons'), { target: { value: 'breath' } })
    await screen.findByRole('button', { name: 'dragon-breath' })

    const stored = JSON.parse(localStorage.getItem(ICON_BODY_CACHE_KEY)!) as {
      sources: Record<string, unknown>
    }
    const storedIds = Object.keys(stored.sources)
    expect(storedIds.every(id => (CURATED_NPC_ICONS as readonly string[]).includes(id))).toBe(true)
    expect(storedIds).not.toContain('not-a-curated-icon')
    expect(localStorage.getItem(ICON_BODY_CACHE_KEY)!.length).toBeLessThan(100_000)
  })

  it('closes on Escape', () => {
    stubIconifyFetch()
    const onClose = vi.fn()
    render(<IconPicker onPick={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
