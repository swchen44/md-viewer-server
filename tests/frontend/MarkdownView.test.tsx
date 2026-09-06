import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownView } from '../../src/frontend/components/MarkdownView.js'

describe('MarkdownView', () => {
  it('renders a heading', () => {
    render(<MarkdownView content="# Hello" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument()
  })

  it('renders a GFM table', () => {
    render(<MarkdownView content={'| A | B |\n|---|---|\n| 1 | 2 |'} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('renders a GFM task list', () => {
    render(<MarkdownView content={'- [x] done\n- [ ] pending'} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('renders a mermaid code fence as a mermaid block, not a plain code block', () => {
    render(<MarkdownView content={'```mermaid\ngraph TD; A-->B;\n```'} />)
    expect(screen.getByTestId('mermaid-block')).toBeInTheDocument()
  })
})
