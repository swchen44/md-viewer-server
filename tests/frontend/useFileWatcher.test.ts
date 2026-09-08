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
    renderHook(() => useFileWatcher(() => {}, () => {}, () => {}))
    expect(MockWebSocket.instances[0].url).toContain('token=tok')
  })

  it('dispatches a file-changed event to onFileChanged', () => {
    const onFileChanged = vi.fn()
    renderHook(() => useFileWatcher(onFileChanged, () => {}, () => {}))
    MockWebSocket.instances[0].emit({ type: 'file-changed', rootId: 0, relPath: 'a.md' })
    expect(onFileChanged).toHaveBeenCalledWith(0, 'a.md')
  })

  it('dispatches a file-added event to onFileAdded', () => {
    const onFileAdded = vi.fn()
    renderHook(() => useFileWatcher(() => {}, onFileAdded, () => {}))
    MockWebSocket.instances[0].emit({ type: 'file-added', rootId: 1, relPath: 'new.md' })
    expect(onFileAdded).toHaveBeenCalledWith(1, 'new.md')
  })

  it('dispatches a file-removed event to onFileRemoved', () => {
    const onFileRemoved = vi.fn()
    renderHook(() => useFileWatcher(() => {}, () => {}, onFileRemoved))
    MockWebSocket.instances[0].emit({ type: 'file-removed', rootId: 2, relPath: 'gone.md' })
    expect(onFileRemoved).toHaveBeenCalledWith(2, 'gone.md')
  })

  it('reconnects with a fixed delay after the socket closes', () => {
    vi.useFakeTimers()
    renderHook(() => useFileWatcher(() => {}, () => {}, () => {}))
    expect(MockWebSocket.instances).toHaveLength(1)

    MockWebSocket.instances[0].onclose?.()
    // Not yet reconnected before the backoff delay elapses.
    expect(MockWebSocket.instances).toHaveLength(1)

    vi.advanceTimersByTime(3000)
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('closes the socket and does not reconnect after unmount', () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useFileWatcher(() => {}, () => {}, () => {}))
    const socket = MockWebSocket.instances[0]
    unmount()
    expect(socket.closed).toBe(true)

    socket.onclose?.()
    vi.advanceTimersByTime(5000)
    expect(MockWebSocket.instances).toHaveLength(1)
  })
})
