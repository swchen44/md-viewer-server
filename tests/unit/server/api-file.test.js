import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRouter } from '../../../src/server/api/file.js'
import { updateSettings } from '../../../src/server/settings.js'

describe('file CRUD API', () => {
  let rootDir
  let configDir
  let roots

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-file-'))
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-file-config-'))
    roots = [{ id: 0, path: rootDir, name: 'root0' }]
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  function buildApp() {
    const app = express()
    app.use(express.json())
    app.use('/api', createFileRouter(roots, configDir))
    return app
  }

  it('GET returns 404 for a missing file', async () => {
    const res = await request(buildApp()).get('/api/file?root=0&path=missing.md')
    expect(res.status).toBe(404)
  })

  it('POST creates an empty file, GET reads it back with charset=utf-8', async () => {
    const app = buildApp()
    const postRes = await request(app).post('/api/file?root=0&path=new.md')
    expect(postRes.status).toBe(201)

    const getRes = await request(app).get('/api/file?root=0&path=new.md')
    expect(getRes.status).toBe(200)
    expect(getRes.headers['content-type']).toContain('charset=utf-8')
    expect(getRes.body.content).toBe('')
  })

  it('POST returns 409 when the file already exists', async () => {
    fs.writeFileSync(path.join(rootDir, 'exists.md'), 'x')
    const res = await request(buildApp()).post('/api/file?root=0&path=exists.md')
    expect(res.status).toBe(409)
  })

  it('PUT writes content and returns new mtime', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'old')
    const stat = fs.statSync(path.join(rootDir, 'a.md'))
    const res = await request(buildApp())
      .put('/api/file?root=0&path=a.md')
      .send({ content: 'new', mtimeMs: stat.mtimeMs })
    expect(res.status).toBe(200)
    expect(fs.readFileSync(path.join(rootDir, 'a.md'), 'utf-8')).toBe('new')
  })

  it('PUT returns 409 with current content on mtime mismatch', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'v1')
    const staleMtime = fs.statSync(path.join(rootDir, 'a.md')).mtimeMs
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'v2 (external)')

    const res = await request(buildApp())
      .put('/api/file?root=0&path=a.md')
      .send({ content: 'v3', mtimeMs: staleMtime })
    expect(res.status).toBe(409)
    expect(res.body.errorCode).toBe('CONFLICT')
    expect(res.body.currentContent).toBe('v2 (external)')
  })

  it('PUT with force=true overwrites despite mismatch', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'v1')
    const staleMtime = fs.statSync(path.join(rootDir, 'a.md')).mtimeMs
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'v2 (external)')

    const res = await request(buildApp())
      .put('/api/file?root=0&path=a.md')
      .send({ content: 'v3 (forced)', mtimeMs: staleMtime, force: true })
    expect(res.status).toBe(200)
    expect(fs.readFileSync(path.join(rootDir, 'a.md'), 'utf-8')).toBe('v3 (forced)')
  })

  // bakOnSave is a server-side persisted setting, not a per-request client
  // choice: the browser must not be able to turn backups on or off (or skip
  // them) by shaping a request body. These four cases pin that the request
  // body is ignored entirely and only the stored setting decides.
  describe('bakOnSave comes from persisted settings, not the request body', () => {
    function writeExisting() {
      fs.writeFileSync(path.join(rootDir, 'a.md'), 'v1')
      return fs.statSync(path.join(rootDir, 'a.md')).mtimeMs
    }

    it('creates a .bak when bakOnSave is stored true and the body says nothing', async () => {
      updateSettings(configDir, { bakOnSave: true })
      const mtimeMs = writeExisting()
      const res = await request(buildApp())
        .put('/api/file?root=0&path=a.md')
        .send({ content: 'v2', mtimeMs })
      expect(res.status).toBe(200)
      expect(fs.existsSync(path.join(rootDir, 'a.md.bak'))).toBe(true)
      expect(fs.readFileSync(path.join(rootDir, 'a.md.bak'), 'utf-8')).toBe('v1')
    })

    it('creates a .bak when bakOnSave is stored true even if the body says backup:false', async () => {
      updateSettings(configDir, { bakOnSave: true })
      const mtimeMs = writeExisting()
      const res = await request(buildApp())
        .put('/api/file?root=0&path=a.md')
        .send({ content: 'v2', mtimeMs, backup: false })
      expect(res.status).toBe(200)
      expect(fs.existsSync(path.join(rootDir, 'a.md.bak'))).toBe(true)
    })

    it('creates no .bak when bakOnSave is stored false even if the body claims backup:true', async () => {
      updateSettings(configDir, { bakOnSave: false })
      const mtimeMs = writeExisting()
      const res = await request(buildApp())
        .put('/api/file?root=0&path=a.md')
        .send({ content: 'v2', mtimeMs, backup: true })
      expect(res.status).toBe(200)
      expect(fs.existsSync(path.join(rootDir, 'a.md.bak'))).toBe(false)
    })

    it('creates no .bak by default (no settings file written yet)', async () => {
      const mtimeMs = writeExisting()
      const res = await request(buildApp())
        .put('/api/file?root=0&path=a.md')
        .send({ content: 'v2', mtimeMs, backup: true })
      expect(res.status).toBe(200)
      expect(fs.existsSync(path.join(rootDir, 'a.md.bak'))).toBe(false)
    })
  })

  it('DELETE removes an existing file', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'x')
    const res = await request(buildApp()).delete('/api/file?root=0&path=a.md')
    expect(res.status).toBe(204)
    expect(fs.existsSync(path.join(rootDir, 'a.md'))).toBe(false)
  })

  it('DELETE returns 404 for a missing file', async () => {
    const res = await request(buildApp()).delete('/api/file?root=0&path=missing.md')
    expect(res.status).toBe(404)
  })

  it('rejects a path-traversal attempt with 400', async () => {
    const res = await request(buildApp()).get('/api/file?root=0&path=../../../etc/passwd')
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('UNSAFE_PATH')
  })

  // >5MB files must not get a full render attempt (syntax-highlighted editor,
  // diagram rendering, etc. could freeze the tab). The guard has to check
  // size via fs.statSync BEFORE calling readFile — returning tooLarge:true
  // only defeats its own purpose if the full content was already read off
  // disk and serialized into the JSON response on the way there.
  describe('GET /api/file size guard (>5MB)', () => {
    const FIVE_MB = 5 * 1024 * 1024

    it('returns tooLarge:true with content:null for a file over the 5MB threshold', async () => {
      fs.writeFileSync(path.join(rootDir, 'big.md'), Buffer.alloc(FIVE_MB + 1, 'a'))
      const res = await request(buildApp()).get('/api/file?root=0&path=big.md')
      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ content: null, tooLarge: true })
      expect(typeof res.body.mtimeMs).toBe('number')
    })

    it('renders normally for a file at exactly the 5MB threshold (not over it)', async () => {
      fs.writeFileSync(path.join(rootDir, 'exact.md'), Buffer.alloc(FIVE_MB, 'a'))
      const res = await request(buildApp()).get('/api/file?root=0&path=exact.md')
      expect(res.status).toBe(200)
      expect(res.body.tooLarge).toBeFalsy()
      expect(typeof res.body.content).toBe('string')
    })
  })
})
