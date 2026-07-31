import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the header and lobby placeholder', () => {
    render(<App />)
    expect(screen.getByText('TTRPG Play-by-Post')).toBeInTheDocument()
    expect(screen.getByText('Lobby (Coming Soon)')).toBeInTheDocument()
  })
})
