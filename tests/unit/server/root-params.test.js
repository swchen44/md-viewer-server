import { describe, expect, it } from 'vitest'
import { PathSafetyError, resolveSafePath } from '../../../src/server/path-safety.js'

describe('resolveSafePath input validation', () => {
  it('raises PathSafetyError for a missing or empty relative path', () => {
    expect(() => resolveSafePath('/tmp', undefined)).toThrow(PathSafetyError)
    expect(() => resolveSafePath('/tmp', '')).toThrow(PathSafetyError)
  })
})
