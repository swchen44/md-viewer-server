import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalPrefs, DEFAULT_LOCAL_PREFS } from '../../src/frontend/hooks/useLocalPrefs.js'

describe('useLocalPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults when nothing is stored', () => {
    const { result } = renderHook(() => useLocalPrefs())
    expect(result.current.prefs).toEqual(DEFAULT_LOCAL_PREFS)
  })

  it('setPref updates one field and persists it', () => {
    const { result } = renderHook(() => useLocalPrefs())
    act(() => result.current.setPref('theme', 'dark'))
    expect(result.current.prefs.theme).toBe('dark')
    const stored = JSON.parse(localStorage.getItem('mvs-local-prefs') ?? '{}')
    expect(stored.theme).toBe('dark')
  })

  it('setPref leaves other fields unchanged', () => {
    const { result } = renderHook(() => useLocalPrefs())
    act(() => result.current.setPref('editorFontSize', 16))
    act(() => result.current.setPref('theme', 'dark'))
    expect(result.current.prefs.editorFontSize).toBe(16)
    expect(result.current.prefs.theme).toBe('dark')
  })

  it('falls back to defaults when localStorage contains corrupt JSON', () => {
    localStorage.setItem('mvs-local-prefs', '{not valid json')
    const { result } = renderHook(() => useLocalPrefs())
    expect(result.current.prefs).toEqual(DEFAULT_LOCAL_PREFS)
  })

  it('fills in missing keys from a partial stored blob (forward-compat with new prefs added later)', () => {
    localStorage.setItem('mvs-local-prefs', JSON.stringify({ theme: 'dark' }))
    const { result } = renderHook(() => useLocalPrefs())
    expect(result.current.prefs.theme).toBe('dark')
    expect(result.current.prefs.editorFontSize).toBe(DEFAULT_LOCAL_PREFS.editorFontSize)
  })

  describe('localStorage failures', () => {
    afterEach(() => vi.restoreAllMocks())

    it('does not throw when getItem fails, and falls back to defaults', () => {
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      const { result } = renderHook(() => useLocalPrefs())
      expect(result.current.prefs).toEqual(DEFAULT_LOCAL_PREFS)
    })

    it('setPref still updates in-memory state when setItem throws', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })
      const { result } = renderHook(() => useLocalPrefs())
      act(() => result.current.setPref('theme', 'dark'))
      expect(result.current.prefs.theme).toBe('dark')
    })
  })
})
