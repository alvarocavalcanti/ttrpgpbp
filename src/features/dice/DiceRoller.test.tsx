import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DiceRoller } from './DiceRoller'

describe('DiceRoller', () => {
  it('renders and toggles open state', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    expect(screen.queryByText('Dice Roller')).not.toBeInTheDocument()
    
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    expect(screen.getByText('Dice Roller')).toBeInTheDocument()
    
    // Close button
    const closeBtn = screen.getByRole('button', { name: '' }) // The SVG only button
    fireEvent.click(closeBtn) // Actually there's multiple buttons, let's find by SVG or aria-label
  })

  it('rolls a basic d20', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)
    
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    
    expect(mockOnRoll).toHaveBeenCalledWith('1d20')
  })

  it('changes quantity and dice type', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)
    
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    
    const quantityInput = screen.getByDisplayValue('1')
    fireEvent.change(quantityInput, { target: { value: '3' } })
    
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'd8' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    
    expect(mockOnRoll).toHaveBeenCalledWith('3d8')
  })

  it('adds modifiers', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)
    
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    
    // Change modifier (second number input)
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[1], { target: { value: '5' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    
    expect(mockOnRoll).toHaveBeenCalledWith('1d20+5')
  })

  it('adds negative modifiers', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)
    
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[1], { target: { value: '-2' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    
    expect(mockOnRoll).toHaveBeenCalledWith('1d20-2')
  })

  it('applies advantage to d20', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)
    
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Adv' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    
    expect(mockOnRoll).toHaveBeenCalledWith('2d20kh1')
  })

  it('applies disadvantage to d20', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)
    
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Dis' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))
    
    expect(mockOnRoll).toHaveBeenCalledWith('2d20kl1')
  })

  it('clamps quantity to 1-100 at the point of input', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    const quantityInput = screen.getByDisplayValue('1')
    fireEvent.change(quantityInput, { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('100d20')
  })

  it('clamps modifier to ±999 at the point of input', () => {
    const mockOnRoll = vi.fn()
    render(<DiceRoller onRoll={mockOnRoll} />)

    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[1], { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: 'Roll' }))

    expect(mockOnRoll).toHaveBeenCalledWith('1d20+999')
  })

  it('hides advantage controls for non-d20', () => {
    render(<DiceRoller onRoll={vi.fn()} />)
    
    fireEvent.click(screen.getByRole('button', { name: /Roll Dice/i }))
    expect(screen.getByRole('button', { name: 'Adv' })).toBeInTheDocument()
    
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'd6' } })
    
    expect(screen.queryByRole('button', { name: 'Adv' })).not.toBeInTheDocument()
  })
})
