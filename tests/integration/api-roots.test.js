import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'
import { createApp } from '../../src/server/app.js'
import { loadOrCreateConfig } from '../../src/server/config.js'
import { startServer } from '../../src/server/entry.js'

describe('POST /api/roots', () => {
  let testRoot
  let configDir
  let app
  let daemonControl
  const token = '1234'

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'api-roots-'))
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-roots-config-'))
    // POST /api/roots persists via appendRoot(), which requires an existing
    // config.json (same as rotateToken()) — seed one, mirroring what `start`
    // would have already done before a daemon is running.
    loadOrCreateConfig(configDir, { roots: [testRoot], port: 4173 })

    daemonControl = { broadcast: vi.fn(), addRootWatch: vi.fn() }

    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    app = createApp({
      config: { token, roots: [testRoot] },
      logger,
      getUptimeSeconds: () => 0,
      packageVersion: '0.0.0',
      onShutdown: vi.fn(),
      roots: [{ id: 0, path: testRoot, name: path.basename(testRoot) }],
      extensions: ['.md'],
      configDir,
      daemonControl,
    })
  })

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true })
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('requires auth', async () => {
    const res = await request(app).post('/api/roots').send({ path: testRoot })
    expect(res.status).toBe(401)
  })

  it('adds a valid new root, persists it, watches it, broadcasts, and returns 201 {id, name}', async () => {
    const newRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-roots-new-'))
    try {
      const res = await request(app)
        .post('/api/roots')
        .set('X-Auth-Token', token)
        .send({ path: newRootDir })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: 1, name: path.basename(newRootDir) })

      // (1) shared `roots` array mutation is visible to a DIFFERENT already-registered
      // router without any restart/re-registration, because they all read it by reference.
      const filesRes = await request(app)
        .get(`/api/files?root=${res.body.id}`)
        .set('X-Auth-Token', token)
      expect(filesRes.status).toBe(200)

      // GET /api/roots also reflects the addition immediately.
      const rootsRes = await request(app).get('/api/roots').set('X-Auth-Token', token)
      expect(rootsRes.body).toEqual([
        { id: 0, name: path.basename(testRoot) },
        { id: 1, name: path.basename(newRootDir) },
      ])

      // (2) appendRoot() persisted the new root to config.json. Compare
      // against path.resolve (what validateRoots/start.js actually stores),
      // not fs.realpathSync — on macOS os.tmpdir() lives under /var, itself
      // a symlink to /private/var, and validateRoots deliberately does not
      // resolve through symlinks.
      const persisted = JSON.parse(
        fs.readFileSync(path.join(configDir, 'config.json'), 'utf8')
      )
      expect(persisted.roots).toContain(path.resolve(newRootDir))

      // (3) daemonControl.addRootWatch(newRoot) was called so chokidar starts watching.
      expect(daemonControl.addRootWatch).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: path.basename(newRootDir) })
      )

      // (4) daemonControl.broadcast({type: 'root-added', ...}) notifies connected browsers.
      expect(daemonControl.broadcast).toHaveBeenCalledWith({
        type: 'root-added',
        rootId: 1,
        name: path.basename(newRootDir),
      })
    } finally {
      fs.rmSync(newRootDir, { recursive: true, force: true })
    }
  })

  it('returns 400 INVALID_ROOT_PATH for a path that does not exist', async () => {
    const res = await request(app)
      .post('/api/roots')
      .set('X-Auth-Token', token)
      .send({ path: path.join(testRoot, 'does-not-exist') })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ errorCode: 'INVALID_ROOT_PATH' })
    expect(daemonControl.addRootWatch).not.toHaveBeenCalled()
    expect(daemonControl.broadcast).not.toHaveBeenCalled()
  })

  it('returns 409 ROOT_OVERLAPS_EXISTING for a path identical to an existing root', async () => {
    const res = await request(app)
      .post('/api/roots')
      .set('X-Auth-Token', token)
      .send({ path: testRoot })

    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('ROOT_OVERLAPS_EXISTING')
    expect(daemonControl.addRootWatch).not.toHaveBeenCalled()
  })

  it('returns 409 ROOT_OVERLAPS_EXISTING when the new path is a SUBDIRECTORY of an existing root', async () => {
    const subdir = path.join(testRoot, 'nested', 'deeper')
    fs.mkdirSync(subdir, { recursive: true })

    const res = await request(app)
      .post('/api/roots')
      .set('X-Auth-Token', token)
      .send({ path: subdir })

    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('ROOT_OVERLAPS_EXISTING')
    expect(res.body.existingRootId).toBe(0)
    expect(daemonControl.addRootWatch).not.toHaveBeenCalled()
  })

  it('returns 409 ROOT_OVERLAPS_EXISTING when an EXISTING root is a subdirectory of the new path (the new path is an ancestor)', async () => {
    // testRoot is nested inside a parent directory we haven't registered as a
    // root yet; adding that parent must be rejected because it would re-cover
    // testRoot's files under a second root id.
    const parentDir = path.dirname(testRoot)

    const res = await request(app)
      .post('/api/roots')
      .set('X-Auth-Token', token)
      .send({ path: parentDir })

    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('ROOT_OVERLAPS_EXISTING')
    expect(res.body.existingRootId).toBe(0)
    expect(daemonControl.addRootWatch).not.toHaveBeenCalled()
  })
})

describe('POST /api/roots — full daemon (watcher actually watches the new root)', () => {
  let configHome
  let stateHome
  let initialRoot
  let server
  let ws

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'api-roots-entry-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'api-roots-entry-state-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.XDG_STATE_HOME = stateHome
    initialRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'api-roots-entry-root-'))
  })

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close()
    if (server) await new Promise((resolve) => server.close(resolve))
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    fs.rmSync(initialRoot, { recursive: true, force: true })
  })

  it('a file change inside a root added via POST /api/roots triggers the existing WebSocket file-changed broadcast', async () => {
    const appConfigDir = path.join(configHome, 'md-viewer-server')
    fs.mkdirSync(appConfigDir, { recursive: true })
    const config = loadOrCreateConfig(appConfigDir, { roots: [initialRoot], port: 0 })

    server = startServer({ logLevel: 'error' })
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address()

    ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${config.token}`)
    await new Promise((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    const newRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-roots-entry-new-'))
    try {
      const rootAddedPromise = new Promise((resolve) => {
        ws.on('message', function onMessage(data) {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'root-added') {
            ws.off('message', onMessage)
            resolve(msg)
          }
        })
      })

      const postRes = await fetch(`http://127.0.0.1:${port}/api/roots`, {
        method: 'POST',
        headers: { 'X-Auth-Token': config.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newRootDir }),
      })
      expect(postRes.status).toBe(201)
      const { id: newRootId } = await postRes.json()

      // Confirms the daemon actually broadcast root-added over the live socket.
      const rootAdded = await rootAddedPromise
      expect(rootAdded.rootId).toBe(newRootId)

      // The real proof this task cares about: chokidar must actually be
      // watching the new root's directory now, not just have it in an
      // in-memory list. A file-changed event over the NEW root, with the
      // NEW root's id, must arrive over the existing WebSocket connection.
      const fileChangedPromise = new Promise((resolve) => {
        ws.on('message', function onMessage(data) {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'file-changed' && msg.rootId === newRootId) {
            ws.off('message', onMessage)
            resolve(msg)
          }
        })
      })

      // Give chokidar's initial scan of the freshly-added root time to settle
      // before writing, mirroring the pattern used in watcher.test.js.
      await new Promise((resolve) => setTimeout(resolve, 300))
      fs.writeFileSync(path.join(newRootDir, 'a.md'), 'v1')
      await new Promise((resolve) => setTimeout(resolve, 300))
      fs.writeFileSync(path.join(newRootDir, 'a.md'), 'v2')

      const fileChanged = await fileChangedPromise
      expect(fileChanged).toEqual(
        expect.objectContaining({ type: 'file-changed', rootId: newRootId, relPath: 'a.md' })
      )

      // Also confirm the daemon survives with the new root persisted, i.e.
      // it would still be served after a restart. Compare against
      // path.resolve, same reasoning as the describe block above.
      const persisted = JSON.parse(
        fs.readFileSync(path.join(appConfigDir, 'config.json'), 'utf8')
      )
      expect(persisted.roots).toContain(path.resolve(newRootDir))
    } finally {
      fs.rmSync(newRootDir, { recursive: true, force: true })
    }
  }, 10000)
})
