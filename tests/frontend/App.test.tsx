import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from '../../src/frontend/App.js'

describe('App', () => {
  it('renders the app shell', () => {
    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
  })
})
