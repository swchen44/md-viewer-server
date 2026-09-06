import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App } from '../../src/frontend/App.js'

function stubRootsFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify([])))
  )
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

/**
 * Routes fetch calls by matching a substring against the requested URL, in the
 * order given. Falls back to an empty-files response so unmatched /api/files
 * calls (e.g. FileTreePanel's own background fetch) don't blow up the test.
 */
function stubRoutedFetch(routes: Array<{ match: string; response: unknown; status?: number }>) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const route = routes.find((r) => url.includes(r.match))
    if (route) return Promise.resolve(jsonResponse(route.response, route.status))
    if (url.includes('/api/files')) return Promise.resolve(jsonResponse({ files: [] }))
    return Promise.resolve(jsonResponse({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('App layout', () => {
  beforeEach(() => stubRootsFetch())
  afterEach(() => vi.unstubAllGlobals())

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

describe('App search wiring', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows a files-mode SearchBar above the file tree', () => {
    stubRoutedFetch([{ match: '/api/roots', response: [{ id: 0, name: 'proj' }] }])
    render(<App />)
    expect(screen.getByTestId('search-bar')).toBeInTheDocument()
    expect(screen.getByText(/all files/i)).toBeInTheDocument()
  })

  it('shows an outline-mode SearchBar (no scope options) above the outline panel', () => {
    stubRoutedFetch([{ match: '/api/roots', response: [{ id: 0, name: 'proj' }] }])
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /outline/i }))
    expect(screen.getByTestId('search-bar')).toBeInTheDocument()
    expect(screen.queryByText(/all files/i)).not.toBeInTheDocument()
  })

  it('issues one GET /api/search per root and merges the results', async () => {
    vi.useFakeTimers()
    const fetchMock = stubRoutedFetch([
      {
        match: '/api/roots',
        response: [
          { id: 0, name: 'proj1' },
          { id: 1, name: 'proj2' },
        ],
      },
      { match: '/api/files?root=0', response: { files: [{ relPath: 'seed0.md', size: 1, mtimeMs: 1 }] } },
      { match: '/api/files?root=1', response: { files: [{ relPath: 'seed1.md', size: 1, mtimeMs: 1 }] } },
      {
        match: 'search?root=0',
        response: { fileMatches: [{ relPath: 'a.md', size: 1, mtimeMs: 1 }], contentMatches: [] },
      },
      {
        match: 'search?root=1',
        response: { fileMatches: [{ relPath: 'b.md', size: 1, mtimeMs: 1 }], contentMatches: [] },
      },
    ])
    render(<App />)
    // Wait until both roots' file lists have loaded — that's proof the async
    // roots fetch resolved and `roots` state is populated, which handleFileSearch
    // needs before it can fan out one /api/search request per root.
    await vi.waitFor(() => expect(screen.getByText('seed0.md')).toBeInTheDocument())
    await vi.waitFor(() => expect(screen.getByText('seed1.md')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'md' } })
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search'))).toBe(true)
    )
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    expect(screen.getByText('b.md')).toBeInTheDocument()

    const searchCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/search'))
    expect(searchCalls).toHaveLength(2)
  })

  it('opens the file from the correct root when a merged search result is clicked', async () => {
    vi.useFakeTimers()
    stubRoutedFetch([
      {
        match: '/api/roots',
        response: [
          { id: 0, name: 'proj1' },
          { id: 1, name: 'proj2' },
        ],
      },
      { match: '/api/files?root=0', response: { files: [{ relPath: 'seed0.md', size: 1, mtimeMs: 1 }] } },
      { match: '/api/files?root=1', response: { files: [{ relPath: 'seed1.md', size: 1, mtimeMs: 1 }] } },
      { match: 'search?root=0', response: { fileMatches: [], contentMatches: [] } },
      {
        match: 'search?root=1',
        response: { fileMatches: [{ relPath: 'b.md', size: 1, mtimeMs: 1 }], contentMatches: [] },
      },
    ])
    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('seed0.md')).toBeInTheDocument())
    await vi.waitFor(() => expect(screen.getByText('seed1.md')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'md' } })
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(screen.getByText('b.md')).toBeInTheDocument())

    fireEvent.click(screen.getByText('b.md'))
    await vi.waitFor(() => expect(screen.getByTestId('tab-bar')).toHaveTextContent('b.md'))
  })

  it('clearing the search query restores the file tree', async () => {
    vi.useFakeTimers()
    stubRoutedFetch([
      { match: '/api/roots', response: [{ id: 0, name: 'proj' }] },
      { match: '/api/files', response: { files: [{ relPath: 'a.md', size: 1, mtimeMs: 1 }] } },
      {
        match: '/api/search',
        response: { fileMatches: [{ relPath: 'z.md', size: 1, mtimeMs: 1 }], contentMatches: [] },
      },
    ])
    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())

    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'z' } })
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(screen.getByText('z.md')).toBeInTheDocument())
    expect(screen.queryByText('a.md')).not.toBeInTheDocument()

    fireEvent.change(input, { target: { value: '' } })
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    expect(screen.queryByText('z.md')).not.toBeInTheDocument()
  })

  it('treats a non-ok /api/search response (e.g. REGEX_TIMEOUT) as empty results instead of crashing', async () => {
    vi.useFakeTimers()
    stubRoutedFetch([
      { match: '/api/roots', response: [{ id: 0, name: 'proj' }] },
      { match: '/api/files', response: { files: [{ relPath: 'a.md', size: 1, mtimeMs: 1 }] } },
      { match: '/api/search', response: { errorCode: 'REGEX_TIMEOUT' }, status: 400 },
    ])
    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /regex/i }))
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'a+' } })

    expect(async () => {
      await vi.advanceTimersByTimeAsync(300)
    }).not.toThrow()
    await vi.advanceTimersByTimeAsync(300)

    // The tree is gone (a search is active) but no matches are shown, and nothing crashed.
    await vi.waitFor(() => expect(screen.queryByText('a.md')).not.toBeInTheDocument())
    expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument()
  })

  it('outline-mode search filters headings client-side without calling a search API', async () => {
    vi.useFakeTimers()
    stubRoutedFetch([
      { match: '/api/roots', response: [{ id: 0, name: 'proj' }] },
      { match: '/api/files', response: { files: [{ relPath: 'a.md', size: 1, mtimeMs: 1 }] } },
      {
        match: '/api/outline',
        response: {
          headings: [
            { level: 1, text: 'Intro', line: 1 },
            { level: 2, text: 'Details', line: 5 },
          ],
        },
      },
    ])
    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('a.md'))

    fireEvent.click(screen.getByRole('button', { name: /outline/i }))
    await vi.waitFor(() => expect(screen.getByText('Intro')).toBeInTheDocument())
    expect(screen.getByText('Details')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'intro' } })
    await vi.advanceTimersByTimeAsync(300)

    await vi.waitFor(() => expect(screen.queryByText('Details')).not.toBeInTheDocument())
    expect(screen.getByText('Intro')).toBeInTheDocument()
    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
        String(url).includes('/api/search')
      )
    ).toBe(false)
  })
})
