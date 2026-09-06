import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { OutlinePanel } from '../../src/frontend/components/OutlinePanel.js'

describe('OutlinePanel', () => {
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('shows a placeholder when no tab is active', () => {
    render(<OutlinePanel activeTab={null} onJumpToHeading={() => {}} />)
    expect(screen.getByText(/no file open/i)).toBeInTheDocument()
  })

  it('fetches and renders headings for the active tab', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            headings: [
              { level: 1, text: 'Intro', line: 1 },
              { level: 2, text: 'Details', line: 5 },
            ],
          })
        )
      )
    )
    render(
      <OutlinePanel activeTab={{ rootId: 0, relPath: 'a.md' }} onJumpToHeading={() => {}} />
    )
    await waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument())
    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('calls onJumpToHeading with the line number when a heading is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ headings: [{ level: 1, text: 'Intro', line: 1 }] }))
      )
    )
    const onJump = vi.fn()
    render(
      <OutlinePanel activeTab={{ rootId: 0, relPath: 'a.md' }} onJumpToHeading={onJump} />
    )
    await waitFor(() => screen.getByText('Intro'))
    fireEvent.click(screen.getByText('Intro'))
    expect(onJump).toHaveBeenCalledWith(1)
  })
})
