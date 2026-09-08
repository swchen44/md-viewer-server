import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { matchOutlineHeadings } from '../../src/frontend/outline-regex-match.js'

// Node's built-in global `localStorage` (available since Node 22+, no flag needed for
// the property to exist) requires an explicit `--localstorage-file` CLI flag to actually
// store anything; without it, the getter silently returns `undefined` instead of a
// working Storage object. On this Node version that broken own-property shadows jsdom's
// otherwise-working `window.localStorage` implementation inside Vitest's jsdom
// environment (real browsers always have a working localStorage — this only affects
// tests). Polyfill an in-memory Storage so any test can rely on `localStorage` normally,
// regardless of the Node version running the suite.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.setItem !== 'function') {
  class MemoryStorage implements Storage {
    private store = new Map<string, string>()
    get length() {
      return this.store.size
    }
    clear(): void {
      this.store.clear()
    }
    getItem(key: string): string | null {
      return this.store.has(key) ? this.store.get(key)! : null
    }
    key(index: number): string | null {
      return Array.from(this.store.keys())[index] ?? null
    }
    removeItem(key: string): void {
      this.store.delete(key)
    }
    setItem(key: string, value: string): void {
      this.store.set(key, String(value))
    }
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  })
}

// jsdom (this project's frontend test environment) does not implement the
// Worker API at all, so OutlinePanel's real Worker-based regex filter (see
// src/frontend/outline-regex-client.ts) would throw "Worker is not defined"
// in every test that exercises regex-mode outline search. Provide a
// same-thread stand-in that honors the same postMessage/onmessage/terminate
// surface and delegates to the exact matching logic the real worker script
// runs, so tests get real (fast) regex results without a real thread.
// Individual tests can still override `Worker` via `vi.stubGlobal('Worker',
// ...)` (restored by `vi.unstubAllGlobals()` in their own afterEach) to
// simulate a slow/stuck worker for timeout-specific assertions.
if (typeof globalThis.Worker === 'undefined') {
  class TestOutlineRegexWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: ErrorEvent) => void) | null = null
    private terminated = false
    postMessage(data: { pattern: string; texts: string[] }) {
      queueMicrotask(() => {
        if (this.terminated) return
        this.onmessage?.({ data: matchOutlineHeadings(data.pattern, data.texts) } as MessageEvent)
      })
    }
    terminate() {
      this.terminated = true
    }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent(): boolean {
      return true
    }
  }
  Object.defineProperty(globalThis, 'Worker', {
    value: TestOutlineRegexWorker,
    configurable: true,
    writable: true,
  })
}

// jsdom (this project's frontend test environment) does not implement
// URL.createObjectURL/revokeObjectURL at all — real browsers always have
// them. PlantUmlView (src/frontend/components/PlantUmlView.tsx) uses
// createObjectURL to turn the proxy's PNG blob response into an <img> src,
// so without a stand-in here every test exercising that path would hit
// "URL.createObjectURL is not a function" and be swallowed by the
// component's own error handling, never reaching the assertion under test.
// Returns/accepts opaque blob: URLs — nothing reads their bytes in tests, so
// no real blob storage is needed.
if (typeof URL.createObjectURL !== 'function') {
  let counter = 0
  URL.createObjectURL = () => `blob:mock-${++counter}`
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {}
}

// Node's global `WebSocket` (available natively since Node 18/22, undici-
// based) is a REAL network client — unlike Worker/URL.createObjectURL above,
// which jsdom simply doesn't implement, this one exists and would actually
// attempt a live connection to whatever ws:// URL is passed to it (e.g. from
// src/frontend/hooks/useFileWatcher.ts, which App.tsx now uses
// unconditionally on every render). Left as-is, every test that renders
// <App> would open a real connection attempt against a nonexistent server,
// and useFileWatcher's own reconnect-on-close timer would keep retrying every
// 3s — a lingering timer/socket that can outlive the test that created it,
// the same "orphaned background process" risk this repo's CLAUDE.md calls
// out for vitest workers. Replace it by default with an inert stand-in that
// never actually connects and never fires any callback on its own. A test
// that needs to inspect real WebSocket message/reconnect behavior overrides
// this locally with `vi.stubGlobal('WebSocket', ...)` (see
// useFileWatcher.test.ts) — `vi.unstubAllGlobals()` in that test's own
// afterEach restores this default again.
class TestNoopWebSocket {
  onmessage: ((event: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  close() {}
  send() {}
}
Object.defineProperty(globalThis, 'WebSocket', {
  value: TestNoopWebSocket,
  configurable: true,
  writable: true,
})

afterEach(() => {
  cleanup()
})
