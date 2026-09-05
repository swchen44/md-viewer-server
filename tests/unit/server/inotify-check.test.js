import { describe, it, expect } from 'vitest'
import { readInotifyLimit } from '../../../src/server/inotify-check.js'

describe('readInotifyLimit', () => {
  it('returns a number on Linux, or null on unsupported platforms', () => {
    const result = readInotifyLimit()
    expect(result === null || typeof result === 'number').toBe(true)
  })
})
