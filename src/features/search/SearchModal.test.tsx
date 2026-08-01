import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SearchModal } from './SearchModal'
import { useSearch } from './useSearch'

vi.mock('./useSearch', () => ({
  useSearch: vi.fn()
}))

describe('SearchModal', () => {
  const mockOnClose = vi.fn()
  const mockOnJumpToMessage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSearch).mockReturnValue({
      searchTerm: '',
      setSearchTerm: vi.fn(),
      results: [],
      loading: false,
      error: null
    })
  })

  it('renders initial empty state', () => {
    render(<SearchModal channelId="c1" onClose={mockOnClose} />)
    expect(screen.getByText('Search Messages')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search by keywords...')).toBeInTheDocument()
    expect(screen.getByText('Enter a search term to find messages in this channel')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<SearchModal channelId="c1" onClose={mockOnClose} />)
    fireEvent.click(screen.getByText('Close'))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', () => {
    const { container } = render(<SearchModal channelId="c1" onClose={mockOnClose} />)
    const backdrop = container.querySelector('.bg-gray-500')
    fireEvent.click(backdrop!)
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape key', () => {
    render(<SearchModal channelId="c1" onClose={mockOnClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('renders loading state', () => {
    vi.mocked(useSearch).mockReturnValue({
      searchTerm: 'hello',
      setSearchTerm: vi.fn(),
      results: [],
      loading: true,
      error: null
    })
    
    const { container } = render(<SearchModal channelId="c1" onClose={mockOnClose} />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders error state', () => {
    vi.mocked(useSearch).mockReturnValue({
      searchTerm: 'hello',
      setSearchTerm: vi.fn(),
      results: [],
      loading: false,
      error: new Error('Failed')
    })
    
    render(<SearchModal channelId="c1" onClose={mockOnClose} />)
    expect(screen.getByText(/An error occurred while searching/i)).toBeInTheDocument()
  })

  it('renders no results state', () => {
    vi.mocked(useSearch).mockReturnValue({
      searchTerm: 'hello',
      setSearchTerm: vi.fn(),
      results: [],
      loading: false,
      error: null
    })
    
    render(<SearchModal channelId="c1" onClose={mockOnClose} />)
    expect(screen.getByText(/No messages found matching "hello"/i)).toBeInTheDocument()
  })

  it('renders results and handles click', () => {
    vi.mocked(useSearch).mockReturnValue({
      searchTerm: 'hello',
      setSearchTerm: vi.fn(),
      results: [
        {
          id: 'msg-1',
          content: 'Hello world',
          created_at: '2023-01-01T12:00:00Z',
          sender: { display_name: 'Hero' }
        } as any
      ],
      loading: false,
      error: null
    })
    
    render(<SearchModal channelId="c1" onClose={mockOnClose} onJumpToMessage={mockOnJumpToMessage} />)
    
    expect(screen.getByText('Hero')).toBeInTheDocument()
    expect(screen.getByText('Hello world')).toBeInTheDocument()

    // Click the result
    fireEvent.click(screen.getByText('Hello world').closest('li')!)
    
    expect(mockOnJumpToMessage).toHaveBeenCalledWith('msg-1')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('calls setSearchTerm on input change', () => {
    const mockSetSearchTerm = vi.fn()
    vi.mocked(useSearch).mockReturnValue({
      searchTerm: '',
      setSearchTerm: mockSetSearchTerm,
      results: [],
      loading: false,
      error: null
    })
    
    render(<SearchModal channelId="c1" onClose={mockOnClose} />)
    
    fireEvent.change(screen.getByPlaceholderText('Search by keywords...'), { target: { value: 'test' } })
    expect(mockSetSearchTerm).toHaveBeenCalledWith('test')
  })
})
