import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../../src/server/app.js'

describe('GET/POST/DELETE /api/tabs', () => {
  let testRoot
  let app
  let daemonControl
  const token = '1234'

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'api-tabs-'))
    fs.mkdirSync(path.join(testRoot, 'notes'))
    fs.writeFileSync(path.join(testRoot, 'notes', 'a.md'), '# A')

    daemonControl = { broadcast: vi.fn(), addRootWatch: vi.fn() }

    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    app = createApp({
      config: { token, roots: [testRoot] },
      logger,
      getUptimeSeconds: () => 0,
      packageVersion: '0.0.0',
      onShutdown: vi.fn(),
      roots: [{ id: 0, path: testRoot, name: path.basename(testRoot) }],
      daemonControl,
    })
  })

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  describe('GET /api/tabs', () => {
    it('returns an empty list initially', async () => {
      const res = await request(app).get('/api/tabs').set('X-Auth-Token', token)
      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('reflects an opened tab', async () => {
      await request(app)
        .post('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 0, path: 'notes/a.md' })

      const res = await request(app).get('/api/tabs').set('X-Auth-Token', token)
      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ rootId: 0, relPath: 'notes/a.md' }])
    })

    it('requires auth', async () => {
      const res = await request(app).get('/api/tabs')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/tabs', () => {
    it('opens a tab for an existing file, broadcasts tab-opened, and returns 201', async () => {
      const res = await request(app)
        .post('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 0, path: 'notes/a.md' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ rootId: 0, relPath: 'notes/a.md' })
      expect(daemonControl.broadcast).toHaveBeenCalledWith({
        type: 'tab-opened',
        rootId: 0,
        relPath: 'notes/a.md',
      })
    })

    it('opens a tab for a path that does not exist on disk yet (open does not require the file to exist)', async () => {
      const res = await request(app)
        .post('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 0, path: 'notes/not-written-yet.md' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ rootId: 0, relPath: 'notes/not-written-yet.md' })
    })

    it('is a no-op re-open when the tab is already open (registry.open is idempotent)', async () => {
      await request(app).post('/api/tabs').set('X-Auth-Token', token).send({ root: 0, path: 'notes/a.md' })
      const res = await request(app)
        .post('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 0, path: 'notes/a.md' })

      expect(res.status).toBe(201)
      const listRes = await request(app).get('/api/tabs').set('X-Auth-Token', token)
      expect(listRes.body).toEqual([{ rootId: 0, relPath: 'notes/a.md' }])
    })

    it('returns 404 ROOT_NOT_FOUND for an unknown root id', async () => {
      const res = await request(app)
        .post('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 999, path: 'notes/a.md' })

      expect(res.status).toBe(404)
      expect(res.body.errorCode).toBe('ROOT_NOT_FOUND')
      expect(daemonControl.broadcast).not.toHaveBeenCalled()
    })

    it('returns 400 UNSAFE_PATH for a path-traversal attempt', async () => {
      const res = await request(app)
        .post('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 0, path: '../../../etc/passwd' })

      expect(res.status).toBe(400)
      expect(res.body.errorCode).toBe('UNSAFE_PATH')
      expect(daemonControl.broadcast).not.toHaveBeenCalled()
    })

    it('requires auth', async () => {
      const res = await request(app).post('/api/tabs').send({ root: 0, path: 'notes/a.md' })
      expect(res.status).toBe(401)
    })
  })

  describe('DELETE /api/tabs', () => {
    it('closes an open tab, broadcasts tab-closed, and returns 200 {}', async () => {
      await request(app).post('/api/tabs').set('X-Auth-Token', token).send({ root: 0, path: 'notes/a.md' })
      daemonControl.broadcast.mockClear()

      const res = await request(app)
        .delete('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 0, path: 'notes/a.md' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({})
      expect(daemonControl.broadcast).toHaveBeenCalledWith({
        type: 'tab-closed',
        rootId: 0,
        relPath: 'notes/a.md',
      })

      const listRes = await request(app).get('/api/tabs').set('X-Auth-Token', token)
      expect(listRes.body).toEqual([])
    })

    it('is idempotent when closing a tab that is not open, and still returns 200 {}', async () => {
      const res = await request(app)
        .delete('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 0, path: 'notes/never-opened.md' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({})
    })

    it('is idempotent even for an unknown root id (no ROOT_NOT_FOUND error)', async () => {
      const res = await request(app)
        .delete('/api/tabs')
        .set('X-Auth-Token', token)
        .send({ root: 999, path: 'notes/a.md' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({})
    })

    it('requires auth', async () => {
      const res = await request(app).delete('/api/tabs').send({ root: 0, path: 'notes/a.md' })
      expect(res.status).toBe(401)
    })
  })
})
