import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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

// The markdown editor's <textarea> and the sidebar's search <input> both carry
// the implicit ARIA "textbox" role, so `getByRole('textbox')` is ambiguous once
// both are on screen — query the editor element directly instead.
async function findEditorTextarea(): Promise<HTMLTextAreaElement> {
  await waitFor(() => expect(document.querySelector('textarea')).toBeInTheDocument())
  return document.querySelector('textarea') as HTMLTextAreaElement
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

  it('clicking the settings gear opens the settings modal', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('App roots error handling', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders without crashing and keeps roots empty when GET /api/roots returns 401', async () => {
    stubRoutedFetch([{ match: '/api/roots', response: { errorCode: 'UNAUTHORIZED' }, status: 401 }])
    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeInTheDocument()

    // Let the (401) /api/roots response resolve and propagate through state.
    // The original bug set `roots` to the error body object itself, which made
    // FileTreePanel's `roots.map(...)` throw during render and — with no Error
    // Boundary in place yet — unmount the entire app. So "the shell/file tree
    // panel are still in the DOM" is the crash check; a regression here would
    // make these `getByTestId` calls throw a "unable to find element" error.
    await waitFor(() => expect(screen.getByTestId('roots-error')).toBeInTheDocument())
    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByTestId('file-tree-panel')).toBeInTheDocument()
    expect(screen.getByTestId('file-tree-panel').querySelectorAll('[style*="cursor: pointer"]')).toHaveLength(0)
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

  it('sends each open tab as its own openPaths param, not comma-joined into one value', async () => {
    vi.useFakeTimers()
    const fetchMock = stubRoutedFetch([
      { match: '/api/roots', response: [{ id: 0, name: 'proj' }] },
      {
        match: '/api/files',
        response: {
          files: [
            { relPath: 'notes/a,b.md', size: 1, mtimeMs: 1 },
            { relPath: 'other.md', size: 1, mtimeMs: 1 },
          ],
        },
      },
      { match: '/api/search', response: { fileMatches: [], contentMatches: [] } },
    ])
    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('notes/a,b.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('notes/a,b.md'))
    fireEvent.click(screen.getByText('other.md'))

    fireEvent.click(screen.getByRole('button', { name: /open tabs/i }))
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'x' } })
    await vi.advanceTimersByTimeAsync(300)

    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search'))).toBe(true)
    )
    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/search'))
    const requestUrl = new URL(String(searchCall![0]), 'http://localhost')
    // Comma-joining both relPaths into one value ('notes/a,b.md,other.md')
    // would be ambiguous — the backend can't tell where one relPath ends and
    // the next begins when a relPath itself legally contains a comma.
    // Repeated `openPaths` params (what URLSearchParams.append produces) keep
    // each relPath intact and unambiguous as its own value.
    expect(requestUrl.searchParams.getAll('openPaths').sort()).toEqual(['notes/a,b.md', 'other.md'])
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

  it('ignores a stale /api/search response that resolves after a newer request', async () => {
    vi.useFakeTimers()
    let resolveFirst: (res: Response) => void
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files')) return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 1, mtimeMs: 1 }] }))
      if (url.includes('/api/search') && url.includes('q=first')) return firstPromise
      if (url.includes('/api/search') && url.includes('q=second')) {
        return Promise.resolve(
          jsonResponse({ fileMatches: [{ relPath: 'second.md', size: 1, mtimeMs: 1 }], contentMatches: [] })
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())

    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'first' } })
    await vi.advanceTimersByTimeAsync(300)

    fireEvent.change(input, { target: { value: 'second' } })
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(screen.getByText('second.md')).toBeInTheDocument())

    // The stale "first" request resolves late — it must not clobber the newer results.
    resolveFirst!(jsonResponse({ fileMatches: [{ relPath: 'first.md', size: 1, mtimeMs: 1 }], contentMatches: [] }))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)

    expect(screen.queryByText('first.md')).not.toBeInTheDocument()
    expect(screen.getByText('second.md')).toBeInTheDocument()
  })

  it('SearchBar debounce uses roots that resolve after the user starts typing', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/roots')) {
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(jsonResponse([{ id: 0, name: 'proj' }])), 50)
        })
      }
      if (url.includes('/api/files')) return Promise.resolve(jsonResponse({ files: [] }))
      if (url.includes('/api/search')) {
        return Promise.resolve(
          jsonResponse({ fileMatches: [{ relPath: 'found.md', size: 1, mtimeMs: 1 }], contentMatches: [] })
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    // Type before the (delayed) /api/roots call resolves.
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'md' } })

    // Let the delayed /api/roots response propagate through a re-render first
    // (proven by FileTreePanel's own per-root fetch), then let the debounce
    // timer fire — mirroring the real-world ordering the bug report describes.
    await vi.advanceTimersByTimeAsync(50)
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/files?root=0'))).toBe(true)
    )

    await vi.advanceTimersByTimeAsync(300)

    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/search'))).toBe(true)
    )
    await vi.waitFor(() => expect(screen.getByText('found.md')).toBeInTheDocument())
  })

  it('typing an outline search query does not re-fetch /api/outline (activeTab stays referentially stable)', async () => {
    vi.useFakeTimers()
    const fetchMock = stubRoutedFetch([
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

    const outlineCallsBefore = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/outline')).length
    expect(outlineCallsBefore).toBe(1)

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'in' } })
    await vi.advanceTimersByTimeAsync(300)
    await vi.waitFor(() => expect(screen.queryByText('Details')).not.toBeInTheDocument())

    const outlineCallsAfter = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/outline')).length
    expect(outlineCallsAfter).toBe(outlineCallsBefore)
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

describe('App main content, save, draft, and conflict wiring', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('opens a file and shows its content in the main content area', async () => {
    stubRoutedFetch([
      { match: '/api/roots', response: [{ id: 0, name: 'proj' }] },
      { match: '/api/files', response: { files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] } },
      { match: '/api/file?', response: { content: '# Hi', mtimeMs: 1, encoding: 'utf-8' } },
    ])
    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
  })

  it('prefers a localStorage draft over freshly-fetched server content when reopening a file, keeping the tab dirty', async () => {
    localStorage.setItem('mvs-draft:0:a.md', '# Draft')
    stubRoutedFetch([
      { match: '/api/roots', response: [{ id: 0, name: 'proj' }] },
      { match: '/api/files', response: { files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] } },
      { match: '/api/file?', response: { content: '# Server', mtimeMs: 1, encoding: 'utf-8' } },
    ])
    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Draft' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: 'Server' })).not.toBeInTheDocument()
    expect(screen.getByTestId('tab-bar').textContent).toContain('●')
  })

  it('switching to edit mode and typing marks the tab dirty and persists a draft', async () => {
    stubRoutedFetch([
      { match: '/api/roots', response: [{ id: 0, name: 'proj' }] },
      { match: '/api/files', response: { files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] } },
      { match: '/api/file?', response: { content: '# Hi', mtimeMs: 1, encoding: 'utf-8' } },
    ])
    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('mode-edit'))
    const textarea = await findEditorTextarea()
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })

    expect(screen.getByTestId('tab-bar').textContent).toContain('●')
    // Draft persistence is debounced (Bug 3 fix) — the localStorage write
    // trails the in-memory update by up to ~300ms rather than being
    // synchronous with the keystroke.
    await waitFor(() => expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('# Hi edited'))
  })

  it('Ctrl+S saves the active tab: PUTs the content+mtime, then updates mtimeMs, clears dirty, and clears the draft', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') return Promise.resolve(jsonResponse({ mtimeMs: 42 }))
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    const textarea = await findEditorTextarea()
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    expect(screen.getByTestId('tab-bar').textContent).toContain('●')

    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })

    await waitFor(() => expect(screen.getByTestId('tab-bar').textContent).not.toContain('●'))
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()

    const putCall = fetchMock.mock.calls.find(([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT')
    expect(putCall).toBeTruthy()
    const [putUrl, putOptions] = putCall!
    expect(String(putUrl)).toContain('root=0')
    expect(String(putUrl)).toContain('path=a.md')
    expect(JSON.parse((putOptions as RequestInit).body as string)).toEqual({ content: '# Hi edited', mtimeMs: 1 })
  })

  it('keeps the tab dirty and preserves the newer draft when the user edits again while a save PUT is still in flight', async () => {
    let resolvePut: (res: Response) => void
    const putPromise = new Promise<Response>((resolve) => {
      resolvePut = resolve
    })
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') return putPromise
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    const textarea = await findEditorTextarea()

    // Edit #1, then Ctrl+S — this is the PUT that stays in flight (deferred).
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })

    // Edit #2 happens *while* the PUT for edit #1 is still pending — the user
    // kept typing before the save round-trip completed. Draft persistence is
    // debounced (Bug 3 fix), so wait out the debounce window rather than
    // asserting synchronously.
    fireEvent.change(textarea, { target: { value: '# Hi edited more' } })
    await waitFor(() => expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('# Hi edited more'))

    // Now let the in-flight PUT (which only ever carried "# Hi edited") succeed.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT')).toBe(true)
    )
    await act(async () => {
      resolvePut!(jsonResponse({ mtimeMs: 42 }))
      // Flush the microtask chain inside handleSave's success branch
      // (await res.json() -> setTabs -> clearDraft) past a real macrotask
      // boundary so it has definitely run before we assert below.
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // The content that was actually PUT ("# Hi edited") is stale — the tab now
    // holds "# Hi edited more", which was never sent to the server. The tab
    // must still read as dirty, and the draft (the only copy of "more") must
    // NOT have been deleted, or a crash right now loses those keystrokes for
    // good.
    expect(screen.getByTestId('tab-bar').textContent).toContain('●')
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('# Hi edited more')
  })

  it('shows ConflictDialog on a 409 save response and force-overwrites when Keep Mine is chosen', async () => {
    let putCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') {
        putCount++
        if (putCount === 1) {
          return Promise.resolve(
            jsonResponse({ errorCode: 'CONFLICT', currentContent: '# External', currentMtimeMs: 99 }, 409)
          )
        }
        return Promise.resolve(jsonResponse({ mtimeMs: 100 }))
      }
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    const textarea = await findEditorTextarea()
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText(/External/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /keep mine/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()
    expect(screen.getByTestId('tab-bar').textContent).not.toContain('●')

    const putCalls = fetchMock.mock.calls.filter(([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT')
    expect(putCalls).toHaveLength(2)
    const secondBody = JSON.parse((putCalls[1][1] as RequestInit).body as string)
    expect(secondBody).toEqual({ content: '# Hi edited', mtimeMs: 1, force: true })
  })

  it('keeps the tab dirty and preserves the newer draft when the user edits again while a Keep Mine force-save PUT is still in flight', async () => {
    let putCount = 0
    let resolveForcePut: (res: Response) => void
    const forcePutPromise = new Promise<Response>((resolve) => {
      resolveForcePut = resolve
    })
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') {
        putCount++
        if (putCount === 1) {
          return Promise.resolve(
            jsonResponse({ errorCode: 'CONFLICT', currentContent: '# External', currentMtimeMs: 99 }, 409)
          )
        }
        // Second PUT is the force-save triggered by "Keep Mine" — stays in
        // flight (deferred) so a concurrent edit can race it.
        return forcePutPromise
      }
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    const textarea = await findEditorTextarea()
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // Click "Keep Mine" — this issues the force-PUT, which stays pending.
    fireEvent.click(screen.getByRole('button', { name: /keep mine/i }))

    // The user keeps typing *while* the force-save PUT is still in flight —
    // this newer edit was never sent to the server. Draft persistence is
    // debounced (Bug 3 fix), so wait out the debounce window rather than
    // asserting synchronously.
    await waitFor(() => expect(putCount).toBe(2))
    fireEvent.change(textarea, { target: { value: '# Hi edited even more' } })
    await waitFor(() => expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('# Hi edited even more'))

    // Now let the force-save PUT (which only ever carried "# Hi edited") succeed.
    await act(async () => {
      resolveForcePut!(jsonResponse({ mtimeMs: 100 }))
      // Flush the microtask chain inside handleKeepMine's success branch past
      // a real macrotask boundary so it has definitely run before asserting.
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // The content that was actually force-PUT ("# Hi edited") is stale — the
    // tab now holds "# Hi edited even more", which was never sent to the
    // server. The tab must still read as dirty, and the draft (the only copy
    // of "even more") must NOT have been deleted, or a crash right now loses
    // those keystrokes for good.
    expect(screen.getByTestId('tab-bar').textContent).toContain('●')
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('# Hi edited even more')
  })

  it('Discard Mine reloads the externally-modified content into the tab and clears the draft, without retrying the save', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse({ errorCode: 'CONFLICT', currentContent: '# External', currentMtimeMs: 99 }, 409)
        )
      }
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    const textarea = await findEditorTextarea()
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const putCallsBefore = fetchMock.mock.calls.filter(
      ([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT'
    ).length

    fireEvent.click(screen.getByRole('button', { name: /discard mine/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('# External')
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()
    expect(screen.getByTestId('tab-bar').textContent).not.toContain('●')

    const putCallsAfter = fetchMock.mock.calls.filter(
      ([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT'
    ).length
    expect(putCallsAfter).toBe(putCallsBefore)
  })

  it('does not resurrect a just-discarded edit when a debounced draft write scheduled before "Discard Mine" was clicked fires afterward', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse({ errorCode: 'CONFLICT', currentContent: '# External', currentMtimeMs: 99 }, 409)
        )
      }
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('a.md'))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    await vi.waitFor(() => expect(document.querySelector('textarea')).toBeInTheDocument())
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement

    // First edit + Ctrl+S -> 409 conflict. handleSave already flushes this
    // edit's pending draft synchronously before the dialog appears, so no
    // debounce timer survives from this step.
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })
    await vi.waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // While the (non-modal) ConflictDialog is open, the user types a NEW edit
    // into the still-interactive editor — this schedules a fresh
    // 300ms-debounced localStorage write via pendingDraftRef.
    fireEvent.change(textarea, { target: { value: '# Hi edited again' } })

    // Well within the 300ms window, click Discard Mine. Only advance timers
    // enough to let the click's own synchronous handler run — not the full
    // debounce.
    fireEvent.click(screen.getByRole('button', { name: /discard mine/i }))
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // The server's content must be in place and the draft cleared immediately.
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('# External')
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()

    // Now let the previously-pending debounced write (from the edit typed
    // while the dialog was open) fire, if it was never cancelled.
    await vi.advanceTimersByTimeAsync(300)

    // The discarded edit must NOT have been silently written back to
    // localStorage.
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()
  })

  it('does not resurrect a spurious draft after "Keep Mine" when a debounced draft write scheduled before the click fires afterward', async () => {
    vi.useFakeTimers()
    let putCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') {
        putCount++
        if (putCount === 1) {
          return Promise.resolve(
            jsonResponse({ errorCode: 'CONFLICT', currentContent: '# External', currentMtimeMs: 99 }, 409)
          )
        }
        return Promise.resolve(jsonResponse({ mtimeMs: 100 }))
      }
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('a.md'))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    await vi.waitFor(() => expect(document.querySelector('textarea')).toBeInTheDocument())
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })
    await vi.waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    // A new edit while the dialog is open schedules a fresh debounced write —
    // its value is identical to the tab's current content (handleChange
    // updates content synchronously), which is exactly what makes this race
    // easy to miss: a resurrected draft would carry the "right" value, just
    // written back into localStorage *after* handleKeepMine's clearDraft().
    fireEvent.change(textarea, { target: { value: '# Hi edited again' } })

    // Click Keep Mine well within the 300ms debounce window.
    fireEvent.click(screen.getByRole('button', { name: /keep mine/i }))
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(putCount).toBe(2))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()
    expect(screen.getByTestId('tab-bar').textContent).not.toContain('●')

    const secondBody = JSON.parse(
      (
        fetchMock.mock.calls.filter(([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT')[1][1] as RequestInit
      ).body as string
    )
    expect(secondBody).toEqual({ content: '# Hi edited again', mtimeMs: 1, force: true })

    // Let the previously-pending debounced write fire, if it was never
    // flushed before the force-save's clearDraft() ran.
    await vi.advanceTimersByTimeAsync(300)

    // A stale timer resurrecting the draft here would leave a draft sitting
    // in localStorage even though the force-save already succeeded and the
    // tab correctly reads as clean — reopening the file would then wrongly
    // show it as dirty again.
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()
  })

  it('does not resurrect a stale ConflictDialog (or fire an unwanted force-PUT) when a tab with an unresolved 409 conflict is closed and the same file is reopened', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse({ errorCode: 'CONFLICT', currentContent: '# External', currentMtimeMs: 99 }, 409)
        )
      }
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    const textarea = await findEditorTextarea()
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText(/External/)).toBeInTheDocument()

    // Close the tab WITHOUT answering the dialog.
    fireEvent.click(screen.getByRole('button', { name: /close a\.md/i }))
    await waitFor(() => expect(screen.queryByTestId('mode-toggle')).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Reopen the SAME file. Tab ids are deterministic (`${rootId}:${relPath}`),
    // so the reopened tab collides with the id the stale conflict was keyed
    // on. (The reopened tab legitimately shows the never-cleared localStorage
    // draft rather than a fresh server fetch — that's the separate, correct
    // "crash-recovered draft wins" behavior, not part of what's under test
    // here.)
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByTestId('mode-toggle')).toBeInTheDocument())

    // The stale dialog (from the closed tab's never-resolved conflict) must
    // not reappear, and nothing about reopening the file may have triggered
    // an unwanted force-PUT — only the one PUT from the original Ctrl+S ever
    // happened.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const putCalls = fetchMock.mock.calls.filter(([, opts]) => (opts as RequestInit | undefined)?.method === 'PUT')
    expect(putCalls).toHaveLength(1)
  })

  it('shows a user-visible, non-crashing error and keeps the tab dirty (draft intact) when a save PUT rejects with a network error', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') return Promise.reject(new Error('network down'))
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    const textarea = await findEditorTextarea()
    fireEvent.change(textarea, { target: { value: '# Hi edited' } })
    expect(screen.getByTestId('tab-bar').textContent).toContain('●')

    // This must not produce an unhandled promise rejection anywhere in the
    // test run — handleSave has to catch the rejected PUT itself.
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })

    await waitFor(() => expect(screen.getByTestId('save-error')).toBeInTheDocument())
    // Draft/dirty state must be untouched by the failed save.
    expect(screen.getByTestId('tab-bar').textContent).toContain('●')
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('# Hi edited')
  })

  it('debounces draft persistence: rapid keystrokes produce only one localStorage write, not one per keystroke', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/roots')) return Promise.resolve(jsonResponse([{ id: 0, name: 'proj' }]))
      if (url.includes('/api/files'))
        return Promise.resolve(jsonResponse({ files: [{ relPath: 'a.md', size: 5, mtimeMs: 1 }] }))
      if (options?.method === 'PUT') return Promise.resolve(jsonResponse({ mtimeMs: 42 }))
      if (url.includes('/api/file?')) return Promise.resolve(jsonResponse({ content: '# Hi', mtimeMs: 1, encoding: 'utf-8' }))
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await vi.waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    fireEvent.click(screen.getByText('a.md'))
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Hi' })).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-edit'))
    await vi.waitFor(() => expect(document.querySelector('textarea')).toBeInTheDocument())
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement

    // This repo's jsdom test environment polyfills `localStorage` with a
    // plain class (see tests/frontend/setup.ts), not a real `Storage`
    // instance — spy on the actual global instance's method rather than
    // `Storage.prototype`.
    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    fireEvent.change(textarea, { target: { value: 'a' } })
    fireEvent.change(textarea, { target: { value: 'ab' } })
    fireEvent.change(textarea, { target: { value: 'abc' } })

    // Nothing should be written to localStorage yet — still inside the
    // debounce window.
    expect(setItemSpy.mock.calls.filter(([key]) => key === 'mvs-draft:0:a.md')).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(300)

    // Exactly one write, carrying the LAST value typed.
    expect(setItemSpy.mock.calls.filter(([key]) => key === 'mvs-draft:0:a.md')).toHaveLength(1)
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('abc')

    setItemSpy.mockRestore()
  })

  it('hides the edit/split mode buttons for a non-UTF-8 file', async () => {
    stubRoutedFetch([
      { match: '/api/roots', response: [{ id: 0, name: 'proj' }] },
      { match: '/api/files', response: { files: [{ relPath: 'bin.md', size: 5, mtimeMs: 1 }] } },
      { match: '/api/file?', response: { content: '<binary>', mtimeMs: 1, encoding: 'unknown' } },
    ])
    render(<App />)
    await waitFor(() => screen.getByText('bin.md'))
    fireEvent.click(screen.getByText('bin.md'))
    await waitFor(() => expect(screen.getByTestId('mode-view')).toBeInTheDocument())
    expect(screen.queryByTestId('mode-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mode-split')).not.toBeInTheDocument()
  })
})
