import fs from 'fs';
let content = fs.readFileSync('src/features/channels/ChannelSettings.test.tsx', 'utf8');

const additionalTests = `
  it('handles archive channel', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Archive Channel'))
    
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ is_archived: true })
    })
  })

  it('handles export chat', async () => {
    // Basic coverage for the button click
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [{ content: 'msg', created_at: '2023-01-01', sender: { display_name: 'test' } }], error: null }) }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    vi.stubGlobal('URL', { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() })

    render(<ChannelSettings channel={mockChannel} onClose={vi.fn()} onUpdate={vi.fn()} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByText('Export Chat to Markdown'))
    
    await waitFor(() => {
      expect(mockSelect).toHaveBeenCalled()
    })
  })
`;

content = content.replace(/}\)/g, (match, offset, string) => {
    if (offset === string.lastIndexOf('})')) {
        return additionalTests + '\n})';
    }
    return match;
});

fs.writeFileSync('src/features/channels/ChannelSettings.test.tsx', content);
