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

afterEach(() => {
  cleanup()
})
