import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRotatingStream } from '../../../src/server/log-rotation.js'

describe('createRotatingStream', () => {
  let dir
  let filePath

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-rotation-test-'))
    filePath = path.join(dir, 'server.log')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('writes chunks to the file', () => {
    const stream = createRotatingStream(filePath, { maxBytes: 1024, maxFiles: 3 })
    stream.write('hello\n')
    stream.write('world\n')
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hello\nworld\n')
  })

  it('rotates to .1 when maxBytes is exceeded', () => {
    const stream = createRotatingStream(filePath, { maxBytes: 10, maxFiles: 3 })
    stream.write('0123456789')
    stream.write('next-chunk')
    expect(fs.readFileSync(`${filePath}.1`, 'utf8')).toBe('0123456789')
    expect(fs.readFileSync(filePath, 'utf8')).toBe('next-chunk')
  })

  it('keeps only maxFiles rotated files, discarding the oldest', () => {
    const stream = createRotatingStream(filePath, { maxBytes: 5, maxFiles: 2 })
    stream.write('aaaaa')
    stream.write('bbbbb')
    stream.write('ccccc')
    expect(fs.readFileSync(filePath, 'utf8')).toBe('ccccc')
    expect(fs.readFileSync(`${filePath}.1`, 'utf8')).toBe('bbbbb')
    expect(fs.readFileSync(`${filePath}.2`, 'utf8')).toBe('aaaaa')
  })
})
