import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import chokidar from 'chokidar'
import { createWatcher } from '../../../src/server/watcher.js'

describe('createWatcher', () => {
  let rootDir
  let watcher

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watcher-'))
  })

  afterEach(async () => {
    if (watcher) await watcher.close()
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  it('emits file-added when a new file is created', async () => {
    const onEvent = vi.fn()
    watcher = createWatcher([{ id: 0, path: rootDir }], onEvent)
    await new Promise((resolve) => setTimeout(resolve, 300)) // let chokidar finish initial scan

    fs.writeFileSync(path.join(rootDir, 'new.md'), 'hi')

    await vi.waitFor(
      () => {
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'file-added', rootId: 0, relPath: 'new.md' })
        )
      },
      { timeout: 2000 }
    )
  })

  it('emits file-changed when a file is modified', async () => {
    fs.writeFileSync(path.join(rootDir, 'existing.md'), 'v1')
    const onEvent = vi.fn()
    watcher = createWatcher([{ id: 0, path: rootDir }], onEvent)
    await new Promise((resolve) => setTimeout(resolve, 300))

    fs.writeFileSync(path.join(rootDir, 'existing.md'), 'v2')

    await vi.waitFor(
      () => {
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'file-changed', rootId: 0, relPath: 'existing.md' })
        )
      },
      { timeout: 2000 }
    )
  })

  it('emits file-removed when a file is deleted', async () => {
    fs.writeFileSync(path.join(rootDir, 'doomed.md'), 'x')
    const onEvent = vi.fn()
    watcher = createWatcher([{ id: 0, path: rootDir }], onEvent)
    await new Promise((resolve) => setTimeout(resolve, 300))

    fs.unlinkSync(path.join(rootDir, 'doomed.md'))

    await vi.waitFor(
      () => {
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'file-removed', rootId: 0, relPath: 'doomed.md' })
        )
      },
      { timeout: 2000 }
    )
  })

  it('does not watch node_modules', async () => {
    fs.mkdirSync(path.join(rootDir, 'node_modules'))
    const onEvent = vi.fn()
    watcher = createWatcher([{ id: 0, path: rootDir }], onEvent)
    await new Promise((resolve) => setTimeout(resolve, 300))

    fs.writeFileSync(path.join(rootDir, 'node_modules', 'ignored.md'), 'x')
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(onEvent).not.toHaveBeenCalled()
  })

  it('forwards a watcher error to onEvent as watch-error, without throwing', () => {
    // Synthetic error via a spied-in fake FSWatcher — avoids depending on the
    // OS/sandbox actually surfacing a real fs error (e.g. EACCES) within a
    // timeout, which proved unreliable in practice.
    const fakeWatcher = new EventEmitter()
    fakeWatcher.close = vi.fn(() => Promise.resolve())
    const watchSpy = vi.spyOn(chokidar, 'watch').mockReturnValue(fakeWatcher)

    const onEvent = vi.fn()
    watcher = createWatcher([{ id: 0, path: rootDir }], onEvent)

    fakeWatcher.emit('error', new Error('boom'))

    expect(onEvent).toHaveBeenCalledWith({ type: 'watch-error', rootId: 0, message: 'boom' })

    watchSpy.mockRestore()
  })
})
