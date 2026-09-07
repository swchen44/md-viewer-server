import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PathModal } from '../../src/frontend/components/PathModal.js'
import * as clipboard from '../../src/frontend/clipboard.js'

describe('PathModal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders nothing when open is false', () => {
    render(<PathModal open={false} path="/a/b.md" onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders nothing when path is null even if open is true', () => {
    render(<PathModal open={true} path={null} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the path text', () => {
    render(<PathModal open={true} path="/Users/a/測試 b.md" onClose={() => {}} />)
    expect(screen.getByText('/Users/a/測試 b.md')).toBeInTheDocument()
  })

  it('shows "Copied" briefly after a successful copy, then reverts', async () => {
    vi.spyOn(clipboard, 'copyText').mockResolvedValue(undefined)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<PathModal open={true} path="/a.md" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument())
    vi.advanceTimersByTime(1500)
    await waitFor(() => expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument())
    vi.useRealTimers()
  })

  it('shows "Copy failed" when copyText rejects', async () => {
    vi.spyOn(clipboard, 'copyText').mockRejectedValue(new Error('denied'))
    render(<PathModal open={true} path="/a.md" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /copy failed/i })).toBeInTheDocument())
  })
})
