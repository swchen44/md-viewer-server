import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from '../../src/frontend/App.js'

describe('App layout', () => {
  it('renders the top bar, sidebar, and an empty tab bar', () => {
    render(<App />)
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
  })

  it('sidebar defaults to files mode and can switch to outline mode', () => {
    render(<App />)
    const outlineButton = screen.getByRole('button', { name: /outline/i })
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-mode', 'files')
    fireEvent.click(outlineButton)
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-mode', 'outline')
  })
})
