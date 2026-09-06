import { describe, it, expect, beforeEach } from 'vitest'
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
})
