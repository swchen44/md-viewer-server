import { describe, it, expect, vi, afterEach } from 'vitest'
import { runOutlineRegexMatch, OutlineRegexTimeoutError } from '../../src/frontend/outline-regex-client.js'

/**
 * jsdom (this project's frontend test environment) does not implement the
 * Worker API at all, so these tests substitute a fake Worker that mimics the
 * postMessage/onmessage/terminate surface `runOutlineRegexMatch` depends on.
 */
class EchoWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  postMessage(data: { pattern: string; texts: string[] }) {
    queueMicrotask(() => {
      if (this.terminated) return
      try {
        const re = new RegExp(data.pattern, 'i')
        const matchedIndexes: number[] = []
        data.texts.forEach((text, i) => {
          if (re.test(text)) matchedIndexes.push(i)
        })
        this.onmessage?.({ data: { ok: true, matchedIndexes } } as MessageEvent)
      } catch (err) {
        this.onmessage?.({ data: { ok: false, error: (err as Error).message } } as MessageEvent)
      }
    })
  }
  terminate() {
    this.terminated = true
  }
}

// A worker that never calls back, standing in for a worker thread stuck
// evaluating a pathological pattern (catastrophic backtracking) — from the
// client wrapper's point of view, "still computing" and "never responding"
// look identical, so this is exactly what the timeout path needs to handle.
class StuckWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  postMessage() {
    // never responds
  }
  terminate() {
    this.terminated = true
  }
}

describe('runOutlineRegexMatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('resolves matched indexes for a normal pattern', async () => {
    vi.stubGlobal('Worker', EchoWorker)
    const matched = await runOutlineRegexMatch('^d', ['Intro', 'Details'])
    expect(matched).toEqual([1])
  })

  it('rejects (does not hang) within the configured timeout when the worker never responds', async () => {
    vi.useFakeTimers()
    const stuckWorkerInstances: StuckWorker[] = []
    class TrackedStuckWorker extends StuckWorker {
      constructor() {
        super()
        stuckWorkerInstances.push(this)
      }
    }
    vi.stubGlobal('Worker', TrackedStuckWorker)

    const resultPromise = runOutlineRegexMatch('(a|a)+$', ['a'.repeat(40)], { timeoutMs: 2000 })
    // Attach a handler synchronously so Node doesn't flag this as an
    // unhandled rejection during the gap before the `expect(...).rejects`
    // assertion below attaches its own handler.
    resultPromise.catch(() => {})
    // Advancing fake timers past the bound proves the wrapper settles on its
    // own schedule, regardless of whether the (simulated) worker ever replies
    // — i.e. the wait is genuinely bounded, not just "usually fast".
    await vi.advanceTimersByTimeAsync(2000)

    await expect(resultPromise).rejects.toBeInstanceOf(OutlineRegexTimeoutError)
    expect(stuckWorkerInstances[0]?.terminated).toBe(true)
  })
})
