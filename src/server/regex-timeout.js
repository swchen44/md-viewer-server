import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WORKER_PATH = path.join(__dirname, 'regex-worker.js')
const DEFAULT_TIMEOUT_MS = 2000

export class RegexTimeoutError extends Error {
  constructor(pattern) {
    super(`Regex evaluation timed out (possible catastrophic backtracking): ${pattern}`)
    this.name = 'RegexTimeoutError'
    this.code = 'REGEX_TIMEOUT'
  }
}

export function runRegexMatch(pattern, items, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    const worker = new Worker(WORKER_PATH, { workerData: { pattern, items } })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      worker.terminate()
      reject(new RegexTimeoutError(pattern))
    }, timeoutMs)

    worker.on('message', (msg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      if (msg.ok) {
        resolve(msg.matchedIndexes)
      } else {
        reject(new Error(msg.error))
      }
    })

    worker.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
  })
}
