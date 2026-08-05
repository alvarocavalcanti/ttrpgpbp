import fs from 'fs';
let content = fs.readFileSync('src/features/channels/MemberList.test.tsx', 'utf8');

const additionalTests = `
  it('allows GM to kick player', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={true} gmId="u1" myUserId="u1" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Kick Player'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(mockOnUpdate).toHaveBeenCalled()
    })
  })

  it('allows player to leave channel', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete, update: vi.fn() } as any)
    const mockOnUpdate = vi.fn()

    render(<MemberList members={mockMembers} isGM={false} gmId="u1" myUserId="u2" onUpdate={mockOnUpdate} />, { wrapper: MemoryRouter })
    
    fireEvent.click(screen.getByTestId('menu-btn-m2'))
    fireEvent.click(screen.getByText('Leave Channel'))
    
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
    })
  })
`;

content = content.replace(/}\)/g, (match, offset, string) => {
    if (offset === string.lastIndexOf('})')) {
        return additionalTests + '\n})';
    }
    return match;
});

fs.writeFileSync('src/features/channels/MemberList.test.tsx', content);
