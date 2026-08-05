import fs from 'fs';
let content = fs.readFileSync('src/features/channels/ArchivedChannels.test.tsx', 'utf8');

const additionalTests = `
  it('handles restore', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    const mockOrder = vi.fn().mockResolvedValue({ data: [{ id: '1', name: 'Archived', created_at: '2023-01-01' }], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
    
    vi.mocked(supabase.from).mockReturnValue({ 
      select: vi.fn().mockReturnValue({ eq: mockEq1 }),
      update: mockUpdate
    } as any)

    render(<ArchivedChannels />, { wrapper: MemoryRouter })
    await waitFor(() => expect(screen.getByText('Archived')).toBeInTheDocument())
    
    import { fireEvent } from '@testing-library/react'
    fireEvent.click(screen.getByText('Restore'))
    
    await waitFor(() => {
      expect(mockUpdateEq).toHaveBeenCalledWith('id', '1')
      expect(screen.getByText('No archived channels found.')).toBeInTheDocument()
    })
  })
`;

content = content.replace(/}\)/g, (match, offset, string) => {
    if (offset === string.lastIndexOf('})')) {
        return additionalTests + '\n})';
    }
    return match;
});

fs.writeFileSync('src/features/channels/ArchivedChannels.test.tsx', content);
