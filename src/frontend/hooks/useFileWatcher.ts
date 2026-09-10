import { useEffect, useRef } from 'react'
import { getStoredToken } from '../auth.js'

// Fixed backoff rather than exponential: the daemon is a local/LAN process
// that normally stays up for the whole session, so the rare disconnect (daemon
// restart, laptop sleep/wake) just needs a simple retry — exponential backoff
// complexity is YAGNI here (see task brief).
const RECONNECT_DELAY_MS = 3000

// Every event the daemon broadcasts carries a type. Root-scoped events also
// carry the root they concern; the payload beyond that differs per event (a
// path for file/tab events, a display name for root-added — see
// src/server/api/roots.js), so validation is split into a shared base check
// plus a per-shape refinement below.
interface BaseEvent {
  type: string
}

interface RootEvent extends BaseEvent {
  rootId: number
}

interface PathEvent extends RootEvent {
  relPath: string
}

interface RootAddedEvent extends RootEvent {
  name: string
}

function isBaseEvent(value: unknown): value is BaseEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BaseEvent).type === 'string'
  )
}

function isRootEvent(value: BaseEvent): value is RootEvent {
  return typeof (value as RootEvent).rootId === 'number'
}

function isPathEvent(value: RootEvent): value is PathEvent {
  return typeof (value as PathEvent).relPath === 'string'
}

function isRootAddedEvent(value: RootEvent): value is RootAddedEvent {
  return typeof (value as RootAddedEvent).name === 'string'
}

export interface FileWatcherHandlers {
  onFileChanged?: (rootId: number, relPath: string) => void
  onFileAdded?: (rootId: number, relPath: string) => void
  onFileRemoved?: (rootId: number, relPath: string) => void
  onTabOpened?: (rootId: number, relPath: string) => void
  onTabClosed?: (rootId: number, relPath: string) => void
  onRootAdded?: (rootId: number, name: string) => void
  onSettingsChanged?: () => void
}

/**
 * Connects to the daemon's `/ws` WebSocket (see src/server/ws-server.js) and
 * dispatches the events it broadcasts to the matching handler:
 *
 * - `file-changed` / `file-added` / `file-removed` from the file watcher
 *   (src/server/watcher.js)
 * - `tab-opened` / `tab-closed` from the open-tabs REST API
 *   (src/server/api/tabs.js), i.e. remote `mvs open` / `mvs close`
 * - `root-added` from POST /api/roots (src/server/api/roots.js)
 *
 * This is the frontend's ONLY WebSocket consumer by design — new event types
 * are added as another `case` and another handler here rather than by opening
 * a second socket.
 *
 * Handlers are passed as one object rather than positionally: six callbacks
 * that all share the shape `(number, string) => void` would otherwise be
 * trivially swappable at the call site with nothing (not even TypeScript) to
 * catch it — mixing up onTabOpened and onTabClosed is exactly the sort of bug
 * that would only show up as tabs mysteriously closing on a second machine.
 * Every handler is optional so a caller only wires the events it cares about.
 */
export function useFileWatcher(handlers: FileWatcherHandlers): void {
  // The connection effect below intentionally has an empty dependency array
  // (connect once, reconnect only on real disconnects) — but the handlers
  // object passed in by the caller is a fresh literal on every render (App.tsx
  // builds it inline, same as its other handlers). A ref lets the long-lived
  // onmessage handler always call the LATEST handlers without needing to tear
  // down and reopen the socket whenever the caller re-renders.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

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
        if (!isBaseEvent(data)) return
        const h = handlersRef.current
        if (data.type === 'settings-changed') {
          h.onSettingsChanged?.()
          return
        }
        if (!isRootEvent(data)) return
        switch (data.type) {
          case 'file-changed':
            if (isPathEvent(data)) h.onFileChanged?.(data.rootId, data.relPath)
            break
          case 'file-added':
            if (isPathEvent(data)) h.onFileAdded?.(data.rootId, data.relPath)
            break
          case 'file-removed':
            if (isPathEvent(data)) h.onFileRemoved?.(data.rootId, data.relPath)
            break
          case 'tab-opened':
            if (isPathEvent(data)) h.onTabOpened?.(data.rootId, data.relPath)
            break
          case 'tab-closed':
            if (isPathEvent(data)) h.onTabClosed?.(data.rootId, data.relPath)
            break
          case 'root-added':
            if (isRootAddedEvent(data)) h.onRootAdded?.(data.rootId, data.name)
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
