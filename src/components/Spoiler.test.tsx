import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Spoiler } from './Spoiler'

describe('Spoiler (issue #709)', () => {
  it('hides its content until clicked', () => {
    render(<Spoiler>the bridge is trapped</Spoiler>)
    const control = screen.getByRole('button', { name: /spoiler/i })
    expect(control).toHaveClass('text-transparent')
    expect(control.textContent).toContain('the bridge is trapped')
    // Hidden from assistive tech while concealed.
    expect(control.querySelector('[aria-hidden="true"]')).not.toBeNull()

    fireEvent.click(control)
    expect(screen.queryByRole('button', { name: /spoiler/i })).toBeNull()
    expect(screen.getByText('the bridge is trapped')).toBeInTheDocument()
  })

  it('reveals on Enter and on Space', () => {
    const { unmount } = render(<Spoiler>secret</Spoiler>)
    fireEvent.keyDown(screen.getByRole('button', { name: /spoiler/i }), { key: 'Enter' })
    expect(screen.queryByRole('button', { name: /spoiler/i })).toBeNull()
    unmount()

    render(<Spoiler>secret</Spoiler>)
    fireEvent.keyDown(screen.getByRole('button', { name: /spoiler/i }), { key: ' ' })
    expect(screen.queryByRole('button', { name: /spoiler/i })).toBeNull()
  })

  it('ignores other keys', () => {
    render(<Spoiler>secret</Spoiler>)
    fireEvent.keyDown(screen.getByRole('button', { name: /spoiler/i }), { key: 'a' })
    expect(screen.getByRole('button', { name: /spoiler/i })).toBeInTheDocument()
  })
})

describe('Spoiler through Markdown (issue #709)', () => {
  it('renders ||…|| hidden and reveals on click (spoilers on by default)', async () => {
    // The global setup.ts swap and the MarkdownImpl mock in Markdown.test.tsx
    // do not apply here, so this is the real wrapper + real impl + Spoiler.
    const { Markdown } = await vi.importActual<typeof import('./Markdown')>('./Markdown')
    render(<Markdown>{'Look out ||the bridge is trapped|| today'}</Markdown>)

    const control = await screen.findByRole('button', { name: /spoiler/i })
    expect(control.textContent).toContain('the bridge is trapped')

    fireEvent.click(control)
    expect(screen.queryByRole('button', { name: /spoiler/i })).toBeNull()
    expect(screen.getByText('the bridge is trapped')).toBeInTheDocument()
  })

  it('leaves ||…|| literal when spoilers is off', async () => {
    const { Markdown } = await vi.importActual<typeof import('./Markdown')>('./Markdown')
    const { container } = render(<Markdown spoilers={false}>{'Hide ||the twist||'}</Markdown>)
    await screen.findByText(/the twist/)
    expect(container.querySelector('span.md-spoiler')).toBeNull()
    expect(screen.queryByRole('button', { name: /spoiler/i })).toBeNull()
  })
})
