import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConflictDialog } from '../../src/frontend/components/ConflictDialog.js'

describe('ConflictDialog', () => {
  it('shows the current (external) content for reference', () => {
    render(
      <ConflictDialog currentContent="external version" onKeepMine={() => {}} onDiscardMine={() => {}} />
    )
    expect(screen.getByText(/external version/)).toBeInTheDocument()
  })

  it('calls onKeepMine when the keep-mine button is clicked', () => {
    const onKeepMine = vi.fn()
    render(<ConflictDialog currentContent="x" onKeepMine={onKeepMine} onDiscardMine={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /keep mine/i }))
    expect(onKeepMine).toHaveBeenCalledOnce()
  })

  it('calls onDiscardMine when the discard-mine button is clicked', () => {
    const onDiscardMine = vi.fn()
    render(<ConflictDialog currentContent="x" onKeepMine={() => {}} onDiscardMine={onDiscardMine} />)
    fireEvent.click(screen.getByRole('button', { name: /discard mine/i }))
    expect(onDiscardMine).toHaveBeenCalledOnce()
  })
})
