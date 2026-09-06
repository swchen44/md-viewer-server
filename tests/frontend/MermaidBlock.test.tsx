import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MermaidBlock } from '../../src/frontend/components/MermaidBlock.js'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation((id: string, definition: string) => {
      if (definition.includes('INVALID')) {
        return Promise.reject(new Error('Parse error'))
      }
      return Promise.resolve({ svg: `<svg data-id="${id}"></svg>` })
    }),
  },
}))

describe('MermaidBlock', () => {
  it('renders the SVG returned by mermaid.render', async () => {
    render(<MermaidBlock definition="graph TD; A-->B;" />)
    await waitFor(() => expect(screen.getByTestId('mermaid-block').innerHTML).toContain('<svg'))
  })

  it('shows an inline error message instead of crashing on invalid syntax', async () => {
    render(<MermaidBlock definition="INVALID syntax here" />)
    await waitFor(() => expect(screen.getByText(/diagram error/i)).toBeInTheDocument())
  })
})
