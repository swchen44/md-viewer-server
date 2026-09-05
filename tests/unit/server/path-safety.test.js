import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveSafePath, PathSafetyError } from '../../../src/server/path-safety.js'

describe('resolveSafePath', () => {
  let rootDir

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-safety-'))
    fs.mkdirSync(path.join(rootDir, 'docs'))
    fs.writeFileSync(path.join(rootDir, 'docs', 'a.md'), 'hi')
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  it('resolves a normal relative path inside root', () => {
    const result = resolveSafePath(rootDir, 'docs/a.md')
    expect(result).toBe(path.join(rootDir, 'docs', 'a.md'))
  })

  it('rejects a path that escapes root via ../', () => {
    expect(() => resolveSafePath(rootDir, '../etc/passwd')).toThrow(PathSafetyError)
  })

  it('rejects a path that escapes root via a nested ../../', () => {
    expect(() => resolveSafePath(rootDir, 'docs/../../etc/passwd')).toThrow(PathSafetyError)
  })

  it('rejects an absolute path outside root', () => {
    expect(() => resolveSafePath(rootDir, '/etc/passwd')).toThrow(PathSafetyError)
  })

  it('rejects a symlink that points outside root', () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-safety-outside-'))
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'nope')
    fs.symlinkSync(outsideDir, path.join(rootDir, 'escape-link'))
    expect(() => resolveSafePath(rootDir, 'escape-link/secret.txt')).toThrow(PathSafetyError)
    fs.rmSync(outsideDir, { recursive: true, force: true })
  })

  it('allows a symlink that points inside root', () => {
    fs.symlinkSync(path.join(rootDir, 'docs'), path.join(rootDir, 'docs-link'))
    const result = resolveSafePath(rootDir, 'docs-link/a.md')
    expect(fs.realpathSync(result)).toBe(fs.realpathSync(path.join(rootDir, 'docs', 'a.md')))
  })
})
