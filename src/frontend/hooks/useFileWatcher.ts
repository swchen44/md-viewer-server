import { useEffect, useRef } from 'react'
import { getStoredToken } from '../auth.js'

// Fixed backoff rather than exponential: the daemon is a local/LAN process
// that normally stays up for the whole session, so the rare disconnect (daemon
// restart, laptop sleep/wake) just needs a simple retry — exponential backoff
// complexity is YAGNI here (see task brief).
const RECONNECT_DELAY_MS = 3000

interface FileEvent {
  type: string
  rootId: number
  relPath: string
}

function isFileEvent(value: unknown): value is FileEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FileEvent).type === 'string' &&
    typeof (value as FileEvent).rootId === 'number' &&
    typeof (value as FileEvent).relPath === 'string'
  )
}

/**
 * Connects to the daemon's `/ws` WebSocket (see src/server/ws-server.js) and
 * dispatches the file events it broadcasts (see src/server/watcher.js:
 * `file-changed` / `file-added` / `file-removed`) to the matching callback.
 *
 * This is the frontend's first WebSocket consumer and is meant to stay the
 * ONLY one — a later plan (remote tab control) extends the same connection
 * with more event types (tab-opened/closed/root-added, etc.) rather than
 * opening a second socket. The internal dispatch-by-`type` structure below is
 * what makes that extension straightforward: adding a new event type is just
 * another `case` and another callback parameter, no protocol/connection
 * changes needed.
 */
export function useFileWatcher(
  onFileChanged: (rootId: number, relPath: string) => void,
  onFileAdded: (rootId: number, relPath: string) => void,
  onFileRemoved: (rootId: number, relPath: string) => void
): void {
  // The connection effect below intentionally has an empty dependency array
  // (connect once, reconnect only on real disconnects) — but the callbacks
  // passed in by the caller can be a fresh closure every render (App.tsx
  // redefines them on every render, same as its other handlers). Refs let the
  // long-lived onmessage handler always call the LATEST callback without
  // needing to tear down and reopen the socket whenever the caller re-renders.
  const onFileChangedRef = useRef(onFileChanged)
  const onFileAddedRef = useRef(onFileAdded)
  const onFileRemovedRef = useRef(onFileRemoved)
  useEffect(() => {
    onFileChangedRef.current = onFileChanged
  }, [onFileChanged])
  useEffect(() => {
    onFileAddedRef.current = onFileAdded
  }, [onFileAdded])
  useEffect(() => {
    onFileRemovedRef.current = onFileRemoved
  }, [onFileRemoved])

  useEffect(() => {
    let cancelled = false
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (cancelled) return
      const token = getStoredToken() ?? ''
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
      const ws = new WebSocket(url)
      socket = ws

      ws.onmessage = (event: { data: string }) => {
        let data: unknown
        try {
          data = JSON.parse(event.data)
        } catch {
          // Malformed payload — nothing sane to dispatch, ignore it.
          return
        }
        if (!isFileEvent(data)) return
        switch (data.type) {
          case 'file-changed':
            onFileChangedRef.current(data.rootId, data.relPath)
            break
          case 'file-added':
            onFileAddedRef.current(data.rootId, data.relPath)
            break
          case 'file-removed':
            onFileRemovedRef.current(data.rootId, data.relPath)
            break
          default:
            // Unknown/future event type (e.g. 'watch-error') — ignore for now.
            break
        }
      }

      ws.onerror = () => {
        // Swallow — the browser follows an error with a close event, which is
        // what actually drives the reconnect below. No separate handling
        // needed here (mirrors ws-server.js swallowing per-client errors).
      }

      ws.onclose = () => {
        if (cancelled) return
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [])
}
