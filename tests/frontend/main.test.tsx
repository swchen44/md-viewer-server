import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// main.tsx calls createRoot(...).render(<App />) directly at module scope, so
// this test doubles both react-dom/client and App to keep the import side-effect-
// free and focus purely on whether main.tsx wires up the URL-token bootstrap
// (src/frontend/auth.ts's initAuthFromUrl()) before rendering.
const renderMock = vi.fn()
const createRootMock = vi.fn(() => ({ render: renderMock }))

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}))

vi.mock('../../src/frontend/App.js', () => ({
  App: () => null,
}))

describe('main.tsx auth bootstrap wiring', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
    document.body.innerHTML = '<div id="root"></div>'
    vi.resetModules()
    createRootMock.mockClear()
    renderMock.mockClear()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('moves a URL token into sessionStorage and strips it from the URL before rendering', async () => {
    window.history.replaceState(null, '', '/?token=abcd')

    await import('../../src/frontend/main.tsx')

    expect(sessionStorage.getItem('mvs-token')).toBe('abcd')
    expect(window.location.search).toBe('')
    expect(createRootMock).toHaveBeenCalled()
  })

  it('does not touch sessionStorage when no token is present in the URL', async () => {
    await import('../../src/frontend/main.tsx')

    expect(sessionStorage.getItem('mvs-token')).toBeNull()
  })
})
