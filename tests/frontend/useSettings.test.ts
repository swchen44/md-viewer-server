import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Bug-1 regression test needs to observe whether `setSettings`/`setError` are
// actually *invoked* after unmount. React 18+ already silently no-ops a state
// update dispatched on an unmounted fiber (no re-render happens and no
// console warning is printed), so asserting on `result.current` or on
// `console.error` afterwards can't distinguish a guarded call from an
// unguarded one. Wrapping `useState`'s setter here — while still delegating
// to the real implementation, so React's own hook semantics are untouched —
// lets the "resolves after unmount" test below assert the setter itself was
// never called once the hook's mountedRef guard is in place, which is the
// actual contract Bug 1's fix establishes.
const stateSetterSpies: ReturnType<typeof vi.fn>[] = []
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: <S,>(initial?: S | (() => S)) => {
      const [state, setState] = actual.useState(initial as S)
      const spyRef = actual.useRef<ReturnType<typeof vi.fn> | null>(null)
      if (!spyRef.current) {
        spyRef.current = vi.fn(setState)
        stateSetterSpies.push(spyRef.current)
      }
      return [state, spyRef.current]
    },
  }
})

import { renderHook, waitFor, act } from '@testing-library/react'
import { useSettings } from '../../src/frontend/hooks/useSettings.js'

function settingsResponse(overrides = {}) {
  return {
    plantumlServerUrl: 'https://www.plantuml.com/plantuml',
    sendToPlantUmlServer: false,
    privacyMode: false,
    blockRemoteContent: false,
    allowHtmlScripts: false,
    bakOnSave: false,
    customCssChoice: 'user1',
    customCssUser1: '',
    customCssUser2: '',
    effective: { blockRemoteContent: false, sendToPlantUmlServer: false, allowHtmlScripts: false },
    ...overrides,
  }
}

describe('useSettings', () => {
  beforeEach(() => {
    sessionStorage.setItem('mvs-token', 'tok')
    stateSetterSpies.length = 0
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('fetches settings on mount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(settingsResponse()))))
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())
    expect(result.current.settings?.allowHtmlScripts).toBe(false)
  })

  // The mount fetch used to hand whatever JSON came back straight to
  // setSettings. A 401 body ({errorCode: 'UNAUTHORIZED'}) then became the
  // settings object, and every consumer silently read garbage: GeneralTab's
  // `locked = settings?.privacyMode ?? false` resolves to false, painting the
  // privacy-locked controls as unlocked while the server may actually have
  // privacy mode on. Same class of bug (and same fix) as App.tsx's /api/roots
  // mount effect.
  it('keeps settings null and sets error when the mount fetch returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errorCode: 'UNAUTHORIZED' }), { status: 401 })
      )
    )
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toBe('UNAUTHORIZED')
    expect(result.current.settings).toBeNull()
  })

  it('keeps settings null and sets error when the mount fetch rejects at the network level', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toBe('UNKNOWN_ERROR')
    expect(result.current.settings).toBeNull()
  })

  it('keeps settings null and sets error when a non-ok mount response has a non-JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 }))
    )
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toBe('UNKNOWN_ERROR')
    expect(result.current.settings).toBeNull()
  })

  it('updateSettings PUTs the patch and updates local state from the response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(settingsResponse())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(settingsResponse({ privacyMode: true })))
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())

    await act(async () => {
      await result.current.updateSettings({ privacyMode: true })
    })

    expect(result.current.settings?.privacyMode).toBe(true)
    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(putCall).toBeDefined()
    expect(JSON.parse(putCall[1].body)).toEqual({ privacyMode: true })
  })

  it('reloadSettings replaces local state with the daemon response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(settingsResponse())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(settingsResponse({ privacyMode: true })))
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())

    await act(async () => {
      await result.current.reloadSettings()
    })

    expect(result.current.settings?.privacyMode).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/settings')
  })

  it('surfaces an error message when updateSettings fails (e.g. 400 invalid settings)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(settingsResponse())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errorCode: 'INVALID_SETTINGS' }), { status: 400 })
      )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())

    await act(async () => {
      await result.current.updateSettings({ plantumlServerUrl: 'not a url' })
    })

    expect(result.current.error).toBe('INVALID_SETTINGS')
  })

  it('does not call setSettings/setError when updateSettings resolves after the hook unmounts', async () => {
    let resolvePut!: (res: Response) => void
    const putPromise = new Promise<Response>((resolve) => {
      resolvePut = resolve
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(settingsResponse())))
      .mockReturnValueOnce(putPromise)
    vi.stubGlobal('fetch', fetchMock)

    const { result, unmount } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())
    await waitFor(() => expect(stateSetterSpies.length).toBe(2))
    const [settingsSetterSpy, errorSetterSpy] = stateSetterSpies
    const settingsCallsBeforeUnmount = settingsSetterSpy.mock.calls.length
    const errorCallsBeforeUnmount = errorSetterSpy.mock.calls.length

    let updatePromise!: Promise<void>
    act(() => {
      updatePromise = result.current.updateSettings({ privacyMode: true })
    })

    unmount()

    // The PUT resolves only after the hook has unmounted.
    resolvePut(new Response(JSON.stringify(settingsResponse({ privacyMode: true }))))
    await act(async () => {
      await updatePromise
    })

    expect(settingsSetterSpy.mock.calls.length).toBe(settingsCallsBeforeUnmount)
    expect(errorSetterSpy.mock.calls.length).toBe(errorCallsBeforeUnmount)
  })

  it('applies the most recent updateSettings response, discarding a stale one that resolves later', async () => {
    let resolveFirstPut!: (res: Response) => void
    const firstPutPromise = new Promise<Response>((resolve) => {
      resolveFirstPut = resolve
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(settingsResponse())))
      .mockReturnValueOnce(firstPutPromise)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(settingsResponse({ privacyMode: true, bakOnSave: true })))
      )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.settings).not.toBeNull())

    // Call #1 (privacyMode) is issued but not yet resolved...
    let firstUpdatePromise!: Promise<void>
    act(() => {
      firstUpdatePromise = result.current.updateSettings({ privacyMode: true })
    })

    // ...before call #2 (bakOnSave) is issued and resolves.
    await act(async () => {
      await result.current.updateSettings({ bakOnSave: true })
    })

    expect(result.current.settings?.bakOnSave).toBe(true)

    // Call #1's response arrives late (network jitter) with stale data — it
    // must not clobber call #2's already-applied, more recent result.
    resolveFirstPut(
      new Response(JSON.stringify(settingsResponse({ privacyMode: true, bakOnSave: false })))
    )
    await act(async () => {
      await firstUpdatePromise
    })

    expect(result.current.settings?.bakOnSave).toBe(true)
    expect(result.current.settings?.privacyMode).toBe(true)
  })
})
