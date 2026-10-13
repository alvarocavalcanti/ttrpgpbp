import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MarkdownCheatSheet } from './MarkdownCheatSheet'

describe('MarkdownCheatSheet', () => {
  it('lists syntax with live previews and closes', () => {
    const onClose = vi.fn()
    render(<MarkdownCheatSheet onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Markdown cheat sheet' })).toBeInTheDocument()
    expect(screen.getByText('Bold')).toBeInTheDocument()
    expect(screen.getByText('**bold**')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close options' }))
    expect(onClose).toHaveBeenCalled()
  })
})
