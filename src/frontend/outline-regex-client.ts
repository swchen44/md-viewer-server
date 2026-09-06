// Bug 3 (Codex adversarial review, /codex:adversarial-review --base 0a87e7d,
// Plan 5 closing review): OutlinePanel's regex-mode heading filter used to run
// `new RegExp(query).test(text)` directly during render, on the main thread,
// with no protection at all. A pathological pattern (catastrophic
// backtracking, e.g. `(a|a)+$` against a moderately long string) can hang a
// JS engine's regex matcher for an effectively unbounded time, and — unlike
// the backend's regex search (src/server/regex-timeout.js +
// src/server/regex-worker.js, which offloads to a node:worker_threads Worker
// with a hard 2s timeout after an earlier pattern-denylist approach turned
// out to be bypassable) — there's no way to preempt a synchronous regex
// match running on a browser tab's single main thread once it's started.
//
// This mirrors the backend's architecture (a worker + a race against a
// timeout that can actually terminate the worker) rather than a cheaper
// mitigation like input-length caps, because length caps alone don't satisfy
// "genuinely bounded": catastrophic backtracking blows up exponentially with
// pattern/input size, so a generous cap (e.g. 500 chars) is still far larger
// than what's needed to hang for a very long time — it reduces the chance of
// a hang without eliminating it. A dedicated Worker is the only mechanism the
// browser gives us to truly bound the wait: the regex runs on a separate
// thread, so even if that thread hangs forever, this thread never blocks —
// it just waits on a Promise (which doesn't occupy the event loop) and can
// walk away via `worker.terminate()` once `timeoutMs` elapses.
//
// This is a lighter version of the backend's message-passing protocol
// (`{ok, matchedIndexes}` instead of a richer envelope) since the only two
// outcomes that matter here are "these indexes matched" and "give up".

import type { OutlineRegexMatchResult } from './outline-regex-match.js'

export class OutlineRegexTimeoutError extends Error {
  constructor(pattern: string) {
    super(`Outline regex evaluation timed out (possible catastrophic backtracking): ${pattern}`)
    this.name = 'OutlineRegexTimeoutError'
  }
}

const DEFAULT_TIMEOUT_MS = 2000

// Callers (OutlinePanel's effect) need a way to give up on an in-flight
// match early — e.g. the query changes again before the previous match
// resolves, or the component unmounts — without waiting out the full
// timeoutMs. An AbortSignal mirrors this codebase's existing idiom for
// cancellable async work (see src/server/api/plantuml.js and
// src/server/doctor.js, both of which pass AbortSignal.timeout(...) to
// fetch); the caller can pass any AbortSignal, including one from an
// AbortController it aborts itself in an effect cleanup.
export function runOutlineRegexMatch(
  pattern: string,
  texts: string[],
  {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
  }: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    let settled = false
    const worker = new Worker(new URL('./outline-regex-worker.js', import.meta.url), {
      type: 'module',
    })

    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      worker.terminate()
      fn()
    }

    function onAbort() {
      settle(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')))
    }

    if (signal) {
      if (signal.aborted) {
        worker.terminate()
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener('abort', onAbort)
    }

    const timer = setTimeout(() => {
      settle(() => reject(new OutlineRegexTimeoutError(pattern)))
    }, timeoutMs)

    worker.onmessage = (event) => {
      const msg = event.data as OutlineRegexMatchResult
      settle(() => {
        if (msg.ok) {
          resolve(msg.matchedIndexes)
        } else {
          reject(new Error(msg.error))
        }
      })
    }

    worker.onerror = (err) => {
      settle(() => reject(err instanceof Error ? err : new Error(String(err))))
    }

    worker.postMessage({ pattern, texts })
  })
}
