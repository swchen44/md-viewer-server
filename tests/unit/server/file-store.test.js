import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readFile, writeFile, listFiles, ConflictError } from '../../../src/server/file-store.js'

describe('file-store', () => {
  let rootDir

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-store-'))
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  describe('readFile', () => {
    it('reads UTF-8 content with mtime', () => {
      fs.writeFileSync(path.join(rootDir, 'a.md'), '# 你好')
      const result = readFile(rootDir, 'a.md')
      expect(result.content).toBe('# 你好')
      expect(result.encoding).toBe('utf-8')
      expect(typeof result.mtimeMs).toBe('number')
    })

    it('flags non-UTF-8 content as unknown encoding', () => {
      fs.writeFileSync(path.join(rootDir, 'bad.md'), Buffer.from([0xff, 0xfe, 0x00, 0x41]))
      const result = readFile(rootDir, 'bad.md')
      expect(result.encoding).toBe('unknown')
    })
  })

  describe('writeFile', () => {
    it('writes new content and returns the new mtime', () => {
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'old')
      const before = readFile(rootDir, 'a.md')
      const result = writeFile(rootDir, 'a.md', 'new', { expectedMtimeMs: before.mtimeMs })
      expect(fs.readFileSync(path.join(rootDir, 'a.md'), 'utf-8')).toBe('new')
      expect(result.mtimeMs).toBeGreaterThanOrEqual(before.mtimeMs)
    })

    it('creates the file if it does not exist yet, with no expectedMtimeMs required', () => {
      writeFile(rootDir, 'new-file.md', 'hello', {})
      expect(fs.readFileSync(path.join(rootDir, 'new-file.md'), 'utf-8')).toBe('hello')
    })

    it('throws ConflictError when expectedMtimeMs does not match current', () => {
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'v1')
      const stale = readFile(rootDir, 'a.md').mtimeMs
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'v2 (external edit)')
      expect(() => writeFile(rootDir, 'a.md', 'v3', { expectedMtimeMs: stale })).toThrow(
        ConflictError
      )
    })

    it('overwrites despite mtime mismatch when force is true', () => {
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'v1')
      const stale = readFile(rootDir, 'a.md').mtimeMs
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'v2 (external edit)')
      writeFile(rootDir, 'a.md', 'v3 (forced)', { expectedMtimeMs: stale, force: true })
      expect(fs.readFileSync(path.join(rootDir, 'a.md'), 'utf-8')).toBe('v3 (forced)')
    })

    it('creates a .bak file when backup is true', () => {
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'original')
      const before = readFile(rootDir, 'a.md')
      writeFile(rootDir, 'a.md', 'updated', { expectedMtimeMs: before.mtimeMs, backup: true })
      expect(fs.readFileSync(path.join(rootDir, 'a.md.bak'), 'utf-8')).toBe('original')
    })

    it('does not create a .bak file when backup is false', () => {
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'original')
      const before = readFile(rootDir, 'a.md')
      writeFile(rootDir, 'a.md', 'updated', { expectedMtimeMs: before.mtimeMs, backup: false })
      expect(fs.existsSync(path.join(rootDir, 'a.md.bak'))).toBe(false)
    })

    it('writes atomically (no partial file visible mid-write)', () => {
      // Verifying atomicity directly is impractical without stubbing fs; instead
      // verify no leftover temp file remains after a successful write.
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'v1')
      const before = readFile(rootDir, 'a.md')
      writeFile(rootDir, 'a.md', 'v2', { expectedMtimeMs: before.mtimeMs })
      const leftovers = fs.readdirSync(rootDir).filter((f) => f.includes('.tmp'))
      expect(leftovers).toEqual([])
    })
  })

  describe('listFiles', () => {
    it('lists files matching given extensions recursively, with size and mtime', () => {
      fs.mkdirSync(path.join(rootDir, 'sub'))
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'hello')
      fs.writeFileSync(path.join(rootDir, 'sub', 'b.html'), '<p>hi</p>')
      fs.writeFileSync(path.join(rootDir, 'ignored.exe'), 'binary')

      const results = listFiles(rootDir, ['.md', '.html'])
      const relPaths = results.map((r) => r.relPath).sort()
      expect(relPaths).toEqual(['a.md', path.join('sub', 'b.html')])
      for (const r of results) {
        expect(typeof r.size).toBe('number')
        expect(typeof r.mtimeMs).toBe('number')
      }
    })
  })
})
