import fs from 'fs';
let content = fs.readFileSync('src/features/channels/EditCharacterModal.test.tsx', 'utf8');

const additionalTest = `
  it('disables buttons while submitting', async () => {
    // create a never-resolving promise to keep it in submitting state
    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(new Promise(() => {})) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    render(<EditCharacterModal member={mockMember} gameSystem="Shadowdark" onClose={vi.fn()} onUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText('Save'))
    
    expect(screen.getByText('Saving...')).toBeDisabled()
    expect(screen.getByText('Cancel')).toBeDisabled()
  })
`;

content = content.replace(/}\)$/g, additionalTest + '\n})');
fs.writeFileSync('src/features/channels/EditCharacterModal.test.tsx', content);
