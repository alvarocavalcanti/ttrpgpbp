import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelHelpModal } from './ChannelHelpModal'
import { getChannelHelp } from './helpContent'

vi.mock('./helpContent', () => ({
  getChannelHelp: vi.fn()
}))

const entries = [
  { slug: 'status-bar', title: 'Channel Status Bar', content: '## What it shows\n\nStatus text.' },
  { slug: 'export-chat', title: 'Export Chat', content: '## Export\n\nDownload a Markdown file.' },
]

describe('ChannelHelpModal', () => {
  beforeEach(() => {
    vi.mocked(getChannelHelp).mockReturnValue(entries as any)
  })

  it('renders topic list and first topic content', () => {
    render(<ChannelHelpModal onClose={vi.fn()} />)
    expect(screen.getAllByText('Channel Status Bar').length).toBeGreaterThan(0)
    expect(screen.getByText('Export Chat')).toBeInTheDocument()
    expect(screen.getByText('What it shows')).toBeInTheDocument()
  })

  it('shows selected topic content when clicked', () => {
    render(<ChannelHelpModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Export Chat'))
    expect(screen.getByText('Export')).toBeInTheDocument()
    expect(screen.queryByText('What it shows')).not.toBeInTheDocument()
  })

  it('shows empty state when no topics exist', () => {
    vi.mocked(getChannelHelp).mockReturnValue([])
    render(<ChannelHelpModal onClose={vi.fn()} />)
    expect(screen.getByText(/No channel help topics available/)).toBeInTheDocument()
  })

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn()
    render(<ChannelHelpModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog').previousElementSibling!)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<ChannelHelpModal onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close on other keys', () => {
    const onClose = vi.fn()
    render(<ChannelHelpModal onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('applies dark-mode classes to content and inactive topic buttons', () => {
    const { container } = render(<ChannelHelpModal onClose={vi.fn()} />)
    expect(container.querySelector('.prose')).toHaveClass('dark:prose-invert')
    const inactive = screen.getByText('Export Chat')
    expect(inactive).toHaveClass('dark:text-gray-300')
    expect(inactive).toHaveClass('dark:hover:bg-gray-700')
  })
})
