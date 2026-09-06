import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

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

afterEach(() => {
  cleanup()
})
