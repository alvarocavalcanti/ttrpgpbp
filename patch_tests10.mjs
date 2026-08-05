import fs from 'fs';
let content = fs.readFileSync('src/features/channels/EditCharacterModal.test.tsx', 'utf8');

const additionalTest = `
  it('handles rendering generic modal with undefined attributes', async () => {
    const mem = { ...mockMember, attributes: undefined }
    render(<EditCharacterModal member={mem} gameSystem="none" onClose={vi.fn()} onUpdate={vi.fn()} />)
    expect(screen.getByDisplayValue('Hero')).toBeInTheDocument()
  })
`;

content = content.replace(/}\)$/g, additionalTest + '\n})');
fs.writeFileSync('src/features/channels/EditCharacterModal.test.tsx', content);
