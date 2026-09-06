import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraft } from '../../src/frontend/hooks/useDraft.js'

describe('useDraft', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when no draft is stored', () => {
    const { result } = renderHook(() => useDraft(0, 'a.md'))
    expect(result.current.draft).toBeNull()
  })

  it('saveDraft persists content and updates the returned draft', () => {
    const { result } = renderHook(() => useDraft(0, 'a.md'))
    act(() => result.current.saveDraft('hello'))
    expect(result.current.draft).toBe('hello')
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBe('hello')
  })

  it('clearDraft removes the stored draft', () => {
    const { result } = renderHook(() => useDraft(0, 'a.md'))
    act(() => result.current.saveDraft('hello'))
    act(() => result.current.clearDraft())
    expect(result.current.draft).toBeNull()
    expect(localStorage.getItem('mvs-draft:0:a.md')).toBeNull()
  })

  it('keys drafts independently per rootId+relPath', () => {
    const { result: a } = renderHook(() => useDraft(0, 'a.md'))
    const { result: b } = renderHook(() => useDraft(1, 'a.md'))
    act(() => a.current.saveDraft('from root 0'))
    expect(b.current.draft).toBeNull()
  })

  it('reloads the draft when rerendered in place for a different rootId/relPath', () => {
    localStorage.setItem('mvs-draft:1:b.md', 'draft for b')
    const { result, rerender } = renderHook(({ rootId, relPath }) => useDraft(rootId, relPath), {
      initialProps: { rootId: 0, relPath: 'a.md' },
    })
    act(() => result.current.saveDraft('draft for a'))
    expect(result.current.draft).toBe('draft for a')

    rerender({ rootId: 1, relPath: 'b.md' })

    expect(result.current.draft).toBe('draft for b')
  })

  describe('localStorage failures', () => {
    afterEach(() => vi.restoreAllMocks())

    it('does not throw when getItem fails, and treats it as no draft', () => {
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      const { result } = renderHook(() => useDraft(0, 'a.md'))
      expect(result.current.draft).toBeNull()
    })

    it('saveDraft still updates in-memory state when setItem throws', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded')
      })
      const { result } = renderHook(() => useDraft(0, 'a.md'))
      act(() => result.current.saveDraft('hello'))
      expect(result.current.draft).toBe('hello')
    })

    it('clearDraft still updates in-memory state when removeItem throws', () => {
      localStorage.setItem('mvs-draft:0:a.md', 'existing')
      vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      const { result } = renderHook(() => useDraft(0, 'a.md'))
      act(() => result.current.clearDraft())
      expect(result.current.draft).toBeNull()
    })
  })
})
