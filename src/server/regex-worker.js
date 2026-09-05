import { parentPort, workerData } from 'node:worker_threads'

const { pattern, items } = workerData

try {
  const re = new RegExp(pattern, 'i')
  const matchedIndexes = []
  for (let i = 0; i < items.length; i++) {
    if (re.test(items[i])) matchedIndexes.push(i)
  }
  parentPort.postMessage({ ok: true, matchedIndexes })
} catch (err) {
  parentPort.postMessage({ ok: false, error: err.message })
}
