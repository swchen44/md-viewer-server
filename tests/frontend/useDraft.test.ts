import { describe, it, expect, beforeEach } from 'vitest'
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
})
