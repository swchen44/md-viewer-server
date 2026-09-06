import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearchHistory } from '../../src/frontend/hooks/useSearchHistory.js'

describe('useSearchHistory', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to an empty history with maxSize 10', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    expect(result.current.entries).toEqual([])
    expect(result.current.maxSize).toBe(10)
  })

  it('addEntry adds a query, most recent first', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.addEntry('foo'))
    act(() => result.current.addEntry('bar'))
    expect(result.current.entries).toEqual(['bar', 'foo'])
  })

  it('addEntry ignores an empty or whitespace-only query', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.addEntry('   '))
    expect(result.current.entries).toEqual([])
  })

  it('addEntry de-dupes by moving an existing entry to the front', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.addEntry('foo'))
    act(() => result.current.addEntry('bar'))
    act(() => result.current.addEntry('foo'))
    expect(result.current.entries).toEqual(['foo', 'bar'])
  })

  it('addEntry truncates to maxSize', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.setMaxSize(2))
    act(() => result.current.addEntry('a'))
    act(() => result.current.addEntry('b'))
    act(() => result.current.addEntry('c'))
    expect(result.current.entries).toEqual(['c', 'b'])
  })

  it('clearHistory empties entries but keeps maxSize', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.setMaxSize(5))
    act(() => result.current.addEntry('foo'))
    act(() => result.current.clearHistory())
    expect(result.current.entries).toEqual([])
    expect(result.current.maxSize).toBe(5)
  })

  it('setMaxSize truncates existing entries down to the new smaller limit', () => {
    const { result } = renderHook(() => useSearchHistory('files'))
    act(() => result.current.addEntry('a'))
    act(() => result.current.addEntry('b'))
    act(() => result.current.addEntry('c'))
    act(() => result.current.setMaxSize(1))
    expect(result.current.entries).toEqual(['c'])
  })

  it('keeps files-mode and outline-mode history independent', () => {
    const files = renderHook(() => useSearchHistory('files'))
    const outline = renderHook(() => useSearchHistory('outline'))
    act(() => files.result.current.addEntry('file query'))
    expect(outline.result.current.entries).toEqual([])
  })

  it('persists across hook instances (survives a reload)', () => {
    const first = renderHook(() => useSearchHistory('files'))
    act(() => first.result.current.addEntry('foo'))
    const second = renderHook(() => useSearchHistory('files'))
    expect(second.result.current.entries).toEqual(['foo'])
  })

  it('reloads its internal state when `mode` changes on an in-place rerender (not remount)', () => {
    localStorage.setItem(
      'mvs-search-history:files',
      JSON.stringify({ maxSize: 10, entries: ['files entry'] })
    )
    const { result, rerender } = renderHook(({ mode }) => useSearchHistory(mode), {
      initialProps: { mode: 'files' },
    })
    expect(result.current.entries).toEqual(['files entry'])

    // Same hook instance rerendered with a new `mode` prop, mirroring how
    // SearchBar is rerendered in place (not remounted) when the sidebar swaps
    // modes.
    rerender({ mode: 'outline' })

    // The hook must reload outline's own (empty) history, not keep showing
    // files-mode's in-memory entries from before the mode switch.
    expect(result.current.entries).toEqual([])

    // Committing in the new mode must not mix in stale entries from the old
    // mode's in-memory state.
    act(() => result.current.addEntry('outline entry'))
    expect(result.current.entries).toEqual(['outline entry'])
    const outlineStored = JSON.parse(localStorage.getItem('mvs-search-history:outline') ?? '{}')
    expect(outlineStored.entries).toEqual(['outline entry'])

    // The old mode's stored history must remain untouched.
    const filesStored = JSON.parse(localStorage.getItem('mvs-search-history:files') ?? '{}')
    expect(filesStored.entries).toEqual(['files entry'])
  })

  it('degrades gracefully when localStorage.setItem throws (private browsing, quota exceeded, etc.)', () => {
    // This repo's test setup polyfills `localStorage` with its own MemoryStorage
    // class (see tests/frontend/setup.ts) rather than jsdom's native Storage, so
    // the spy must target that instance directly, not `Storage.prototype`.
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      const { result } = renderHook(() => useSearchHistory('files'))

      expect(() => act(() => result.current.addEntry('foo'))).not.toThrow()
      expect(result.current.entries).toEqual(['foo'])

      expect(() => act(() => result.current.setMaxSize(5))).not.toThrow()
      expect(result.current.maxSize).toBe(5)

      expect(() => act(() => result.current.clearHistory())).not.toThrow()
      expect(result.current.entries).toEqual([])
    } finally {
      setItemSpy.mockRestore()
    }
  })
})
