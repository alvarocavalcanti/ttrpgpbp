import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PlatformStats, formatStat } from './PlatformStats'

const stats = {
  games: 42,
  messages: 1_240,
  members: 17,
  activeGames: 5,
  recruitingGames: 3,
  newGamesWeek: 2,
}

describe('formatStat', () => {
  // DAMP table: the public band must never round up.
  it.each([
    [0, '0'],
    [1, '1'],
    [99, '99'],
    [100, '100'],
    [101, '100+'],
    [137, '130+'],
    [1_437, '1,400+'],
    [9_082_298, '9,000,000+'],
  ])('formats %i as %s', (value, expected) => {
    expect(formatStat(value)).toBe(expected)
  })
})

describe('PlatformStats', () => {
  it('renders the three figures and the proof line with the activity rule', () => {
    const { container } = render(<PlatformStats stats={stats} loading={false} variant="public" />)

    // dl semantics: the labels carry the meaning, so they are the accessible
    // name of each figure.
    expect(Array.from(container.querySelectorAll('dt')).map((n) => n.textContent)).toEqual([
      'Games',
      'Messages sent',
      'Members',
    ])

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('1,200+')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()

    expect(screen.getByText('5 active games · 3 recruiting now · 2 new this week')).toBeInTheDocument()
    expect(
      screen.getByText(
        'A game counts as active when at least two people posted at least fifteen messages in it during the past two weeks.',
      ),
    ).toBeInTheDocument()
  })

  it('reads as singular when the proof line counts one', () => {
    render(
      <PlatformStats
        stats={{ ...stats, activeGames: 1, recruitingGames: 1, newGamesWeek: 1 }}
        loading={false}
        variant="public"
      />,
    )

    expect(screen.getByText('1 active game · 1 recruiting now · 1 new this week')).toBeInTheDocument()
  })

  it('keeps the labels and the line count while loading, and shows no numbers', () => {
    const { container } = render(<PlatformStats stats={null} loading variant="public" />)

    const list = container.querySelector('dl[aria-label="Platform activity"]')
    expect(list).not.toBeNull()
    expect(list).toHaveAttribute('aria-busy', 'true')
    expect(Array.from(container.querySelectorAll('dt')).map((n) => n.textContent)).toEqual([
      'Games',
      'Messages sent',
      'Members',
    ])
    expect(screen.getByText('— active games · — recruiting now · — new this week')).toBeInTheDocument()
    // No fabricated zero, and nothing that looks like a real count.
    expect(container.textContent).not.toMatch(/\d/)
  })

  it('renders nothing when the fetch failed', () => {
    const { container } = render(<PlatformStats stats={null} loading={false} variant="public" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('omits the proof line and the rule on the compact Lobby variant', () => {
    render(<PlatformStats stats={stats} loading={false} variant="compact" />)

    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.queryByText(/active games/)).not.toBeInTheDocument()
    expect(screen.queryByText(/past two weeks/)).not.toBeInTheDocument()
  })
})
