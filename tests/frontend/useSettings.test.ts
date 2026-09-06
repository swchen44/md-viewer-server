import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  beforeEach(() => sessionStorage.setItem('mvs-token', 'tok'))
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
})
