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
})
