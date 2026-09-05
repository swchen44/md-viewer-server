import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRouter } from '../../../src/server/api/file.js'

describe('file CRUD API', () => {
  let rootDir
  let roots

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-file-'))
    roots = [{ id: 0, path: rootDir, name: 'root0' }]
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  function buildApp() {
    const app = express()
    app.use(express.json())
    app.use('/api', createFileRouter(roots))
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
})
