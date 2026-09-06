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

  it('shows an error state instead of crashing when the outline request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errorCode: 'FILE_NOT_FOUND' }), { status: 404 })
      )
    )
    render(
      <OutlinePanel activeTab={{ rootId: 0, relPath: 'a.md' }} onJumpToHeading={() => {}} />
    )
    await waitFor(() => expect(screen.getByText(/failed to load outline/i)).toBeInTheDocument())
  })

  it('clears stale headings synchronously when switching to a different tab', async () => {
    let resolveSecond: (res: Response) => void
    const secondFetchPromise = new Promise<Response>((resolve) => {
      resolveSecond = resolve
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ headings: [{ level: 1, text: 'Intro', line: 1 }] }))
      )
      .mockReturnValueOnce(secondFetchPromise)
    vi.stubGlobal('fetch', fetchMock)

    const onJump = vi.fn()
    const { rerender } = render(
      <OutlinePanel activeTab={{ rootId: 0, relPath: 'a.md' }} onJumpToHeading={onJump} />
    )
    await waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument())

    rerender(
      <OutlinePanel activeTab={{ rootId: 0, relPath: 'b.md' }} onJumpToHeading={onJump} />
    )

    // Tab A's stale heading must be gone immediately, before tab B's fetch resolves.
    expect(screen.queryByText('Intro')).not.toBeInTheDocument()

    resolveSecond!(
      new Response(JSON.stringify({ headings: [{ level: 1, text: 'Other', line: 9 }] }))
    )
    await waitFor(() => expect(screen.getByText('Other')).toBeInTheDocument())
    expect(onJump).not.toHaveBeenCalled()
  })

  it('clears a prior error state once a retry for the same tab succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: 'FILE_NOT_FOUND' }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ headings: [{ level: 1, text: 'Intro', line: 1 }] }))
      )
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <OutlinePanel activeTab={{ rootId: 0, relPath: 'a.md' }} onJumpToHeading={() => {}} />
    )
    await waitFor(() => expect(screen.getByText(/failed to load outline/i)).toBeInTheDocument())

    // Same logical tab, new object reference (mirrors App.tsx creating a fresh
    // activeTab literal on every render) — this re-triggers the fetch effect.
    rerender(<OutlinePanel activeTab={{ rootId: 0, relPath: 'a.md' }} onJumpToHeading={() => {}} />)

    await waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument())
    expect(screen.queryByText(/failed to load outline/i)).not.toBeInTheDocument()
  })

  it('filters headings by a plain-text query, case-insensitively', async () => {
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
      <OutlinePanel
        activeTab={{ rootId: 0, relPath: 'a.md' }}
        onJumpToHeading={() => {}}
        headingFilter={{ query: 'intro', regex: false }}
      />
    )
    await waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument())
    expect(screen.queryByText('Details')).not.toBeInTheDocument()
  })

  it('filters headings using a regex query', async () => {
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
      <OutlinePanel
        activeTab={{ rootId: 0, relPath: 'a.md' }}
        onJumpToHeading={() => {}}
        headingFilter={{ query: '^D', regex: true }}
      />
    )
    await waitFor(() => expect(screen.getByText('Details')).toBeInTheDocument())
    expect(screen.queryByText('Intro')).not.toBeInTheDocument()
  })

  it('shows all headings when headingFilter query is empty', async () => {
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
      <OutlinePanel
        activeTab={{ rootId: 0, relPath: 'a.md' }}
        onJumpToHeading={() => {}}
        headingFilter={{ query: '', regex: false }}
      />
    )
    await waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument())
    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('shows no headings for an invalid regex instead of crashing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ headings: [{ level: 1, text: 'Intro', line: 1 }] }))
    )
    vi.stubGlobal('fetch', fetchMock)
    render(
      <OutlinePanel
        activeTab={{ rootId: 0, relPath: 'a.md' }}
        onJumpToHeading={() => {}}
        headingFilter={{ query: '(unclosed', regex: true }}
      />
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('Intro')).not.toBeInTheDocument()
  })
})
