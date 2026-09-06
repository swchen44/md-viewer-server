import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { FileTreePanel } from '../../src/frontend/components/FileTreePanel.js'

function mockFetchSequence(responses: unknown[]) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const body = responses[call++]
      return Promise.resolve(new Response(JSON.stringify(body)))
    })
  )
}

describe('FileTreePanel', () => {
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('renders files from a single root without a root-name header', async () => {
    mockFetchSequence([{ files: [{ relPath: 'a.md', size: 10, mtimeMs: 1 }] }])
    render(<FileTreePanel roots={[{ id: 0, name: 'myproject' }]} onOpenFile={() => {}} />)

    await waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    expect(screen.queryByText('myproject')).not.toBeInTheDocument()
  })

  it('shows a root-name header for each root when there are multiple roots', async () => {
    mockFetchSequence([
      { files: [{ relPath: 'a.md', size: 10, mtimeMs: 1 }] },
      { files: [{ relPath: 'b.md', size: 20, mtimeMs: 2 }] },
    ])
    render(
      <FileTreePanel
        roots={[
          { id: 0, name: 'proj1' },
          { id: 1, name: 'proj2' },
        ]}
        onOpenFile={() => {}}
      />
    )

    await waitFor(() => expect(screen.getByText('proj1')).toBeInTheDocument())
    expect(screen.getByText('proj2')).toBeInTheDocument()
    expect(screen.getByText('a.md')).toBeInTheDocument()
    expect(screen.getByText('b.md')).toBeInTheDocument()
  })

  it('calls onOpenFile with the root id and relPath when a file is clicked', async () => {
    mockFetchSequence([{ files: [{ relPath: 'a.md', size: 10, mtimeMs: 1 }] }])
    const onOpenFile = vi.fn()
    render(<FileTreePanel roots={[{ id: 0, name: 'proj' }]} onOpenFile={onOpenFile} />)

    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    expect(onOpenFile).toHaveBeenCalledWith(0, 'a.md')
  })

  it('renders a results list instead of the tree when searchResults is provided', () => {
    mockFetchSequence([{ files: [{ relPath: 'a.md', size: 10, mtimeMs: 1 }] }])
    const onOpenFile = vi.fn()
    render(
      <FileTreePanel
        roots={[{ id: 0, name: 'proj' }]}
        onOpenFile={onOpenFile}
        searchResults={{
          fileMatches: [{ relPath: 'name-match.md', size: 5, mtimeMs: 1, rootId: 0 }],
          contentMatches: [
            {
              relPath: 'content-match.md',
              rootId: 0,
              matches: [{ line: 3, text: 'hello world' }],
            },
          ],
        }}
      />
    )

    expect(screen.getByText('name-match.md')).toBeInTheDocument()
    expect(screen.getByText('content-match.md')).toBeInTheDocument()
    expect(screen.getByText(/hello world/)).toBeInTheDocument()
    expect(screen.queryByText('a.md')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('name-match.md'))
    expect(onOpenFile).toHaveBeenCalledWith(0, 'name-match.md')

    fireEvent.click(screen.getByText('content-match.md'))
    expect(onOpenFile).toHaveBeenCalledWith(0, 'content-match.md')
  })

  it('merges search results carrying different rootIds so onOpenFile opens the right root', () => {
    mockFetchSequence([{ files: [] }, { files: [] }])
    const onOpenFile = vi.fn()
    render(
      <FileTreePanel
        roots={[
          { id: 0, name: 'proj1' },
          { id: 1, name: 'proj2' },
        ]}
        onOpenFile={onOpenFile}
        searchResults={{
          fileMatches: [
            { relPath: 'a.md', size: 1, mtimeMs: 1, rootId: 0 },
            { relPath: 'a.md', size: 1, mtimeMs: 1, rootId: 1 },
          ],
          contentMatches: [],
        }}
      />
    )

    const matches = screen.getAllByText('a.md')
    expect(matches).toHaveLength(2)
    fireEvent.click(matches[1])
    expect(onOpenFile).toHaveBeenCalledWith(1, 'a.md')
  })

  it('falls back to the tree view when searchResults is null', async () => {
    mockFetchSequence([{ files: [{ relPath: 'a.md', size: 10, mtimeMs: 1 }] }])
    render(
      <FileTreePanel
        roots={[{ id: 0, name: 'proj' }]}
        onOpenFile={() => {}}
        searchResults={null}
      />
    )
    await waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
  })
})
