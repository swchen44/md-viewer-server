import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFileWatcher } from '../../src/frontend/hooks/useFileWatcher.js'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    MockWebSocket.instances.push(this)
  }
  close() {
    this.closed = true
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

describe('useFileWatcher', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    sessionStorage.setItem('mvs-token', 'tok')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
    vi.useRealTimers()
  })

  it('connects to /ws with the stored token', () => {
    renderHook(() => useFileWatcher({}))
    expect(MockWebSocket.instances[0].url).toContain('token=tok')
  })

  it('dispatches a file-changed event to onFileChanged', () => {
    const onFileChanged = vi.fn()
    renderHook(() => useFileWatcher({ onFileChanged }))
    MockWebSocket.instances[0].emit({ type: 'file-changed', rootId: 0, relPath: 'a.md' })
    expect(onFileChanged).toHaveBeenCalledWith(0, 'a.md')
  })

  it('dispatches a file-added event to onFileAdded', () => {
    const onFileAdded = vi.fn()
    renderHook(() => useFileWatcher({ onFileAdded }))
    MockWebSocket.instances[0].emit({ type: 'file-added', rootId: 1, relPath: 'new.md' })
    expect(onFileAdded).toHaveBeenCalledWith(1, 'new.md')
  })

  it('dispatches a file-removed event to onFileRemoved', () => {
    const onFileRemoved = vi.fn()
    renderHook(() => useFileWatcher({ onFileRemoved }))
    MockWebSocket.instances[0].emit({ type: 'file-removed', rootId: 2, relPath: 'gone.md' })
    expect(onFileRemoved).toHaveBeenCalledWith(2, 'gone.md')
  })

  it('dispatches a tab-opened event to onTabOpened', () => {
    const onTabOpened = vi.fn()
    renderHook(() => useFileWatcher({ onTabOpened }))
    MockWebSocket.instances[0].emit({ type: 'tab-opened', rootId: 0, relPath: 'remote.md' })
    expect(onTabOpened).toHaveBeenCalledWith(0, 'remote.md')
  })

  it('dispatches a tab-closed event to onTabClosed', () => {
    const onTabClosed = vi.fn()
    renderHook(() => useFileWatcher({ onTabClosed }))
    MockWebSocket.instances[0].emit({ type: 'tab-closed', rootId: 1, relPath: 'remote.md' })
    expect(onTabClosed).toHaveBeenCalledWith(1, 'remote.md')
  })

  // root-added is the first broadcast event whose payload carries `name`
  // instead of `relPath` (see src/server/api/roots.js), so it exercises the
  // widened payload validation, not just another dispatch case.
  it('dispatches a root-added event to onRootAdded', () => {
    const onRootAdded = vi.fn()
    renderHook(() => useFileWatcher({ onRootAdded }))
    MockWebSocket.instances[0].emit({ type: 'root-added', rootId: 3, name: 'docs' })
    expect(onRootAdded).toHaveBeenCalledWith(3, 'docs')
  })

  it('dispatches a settings-changed event to onSettingsChanged', () => {
    const onSettingsChanged = vi.fn()
    renderHook(() => useFileWatcher({ onSettingsChanged }))
    MockWebSocket.instances[0].emit({ type: 'settings-changed' })
    expect(onSettingsChanged).toHaveBeenCalledTimes(1)
  })

  it('ignores a root-added event with no name, and a tab-opened event with no relPath', () => {
    const onRootAdded = vi.fn()
    const onTabOpened = vi.fn()
    renderHook(() => useFileWatcher({ onRootAdded, onTabOpened }))
    MockWebSocket.instances[0].emit({ type: 'root-added', rootId: 3 })
    MockWebSocket.instances[0].emit({ type: 'tab-opened', rootId: 3 })
    expect(onRootAdded).not.toHaveBeenCalled()
    expect(onTabOpened).not.toHaveBeenCalled()
  })

  // The handlers object is a fresh literal on every render (App.tsx rebuilds
  // it inline), but the socket is opened once — a re-render must not leave the
  // long-lived onmessage handler calling the FIRST render's stale callbacks.
  it('dispatches to the latest handlers after a re-render, without reconnecting', () => {
    const first = vi.fn()
    const second = vi.fn()
    let handler = first
    const { rerender } = renderHook(() => useFileWatcher({ onTabOpened: (r, p) => handler(r, p) }))
    handler = second
    rerender()
    MockWebSocket.instances[0].emit({ type: 'tab-opened', rootId: 0, relPath: 'a.md' })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(0, 'a.md')
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('reconnects with a fixed delay after the socket closes', () => {
    vi.useFakeTimers()
    renderHook(() => useFileWatcher({}))
    expect(MockWebSocket.instances).toHaveLength(1)

    MockWebSocket.instances[0].onclose?.()
    // Not yet reconnected before the backoff delay elapses.
    expect(MockWebSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(3000)
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('closes the socket and does not reconnect after unmount', () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useFileWatcher({}))
    const socket = MockWebSocket.instances[0]
    unmount()
    expect(socket.closed).toBe(true)

    socket.onclose?.()
    vi.advanceTimersByTime(5000)
    expect(MockWebSocket.instances).toHaveLength(1)
  })
})
