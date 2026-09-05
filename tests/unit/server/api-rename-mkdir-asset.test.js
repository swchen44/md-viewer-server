import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRenameMkdirRouter } from '../../../src/server/api/rename-mkdir.js'
import { createAssetRouter } from '../../../src/server/api/asset.js'

describe('rename, mkdir, asset API', () => {
  let rootDir
  let roots

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-rn-'))
    roots = [{ id: 0, path: rootDir, name: 'root0' }]
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  function buildApp() {
    const app = express()
    app.use(express.json())
    app.use('/api', createRenameMkdirRouter(roots))
    app.use('/api', createAssetRouter(roots))
    return app
  }

  it('POST /api/rename moves a file', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'x')
    const res = await request(buildApp())
      .post('/api/rename')
      .send({ root: 0, from: 'a.md', to: 'b.md' })
    expect(res.status).toBe(200)
    expect(fs.existsSync(path.join(rootDir, 'a.md'))).toBe(false)
    expect(fs.existsSync(path.join(rootDir, 'b.md'))).toBe(true)
  })

  it('POST /api/mkdir creates a directory', async () => {
    const res = await request(buildApp()).post('/api/mkdir?root=0&path=newdir')
    expect(res.status).toBe(201)
    expect(fs.statSync(path.join(rootDir, 'newdir')).isDirectory()).toBe(true)
  })

  it('GET /api/asset streams an image with correct content-type', async () => {
    fs.writeFileSync(path.join(rootDir, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const res = await request(buildApp()).get('/api/asset?root=0&path=pic.png')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
  })

  it('GET /api/asset returns text/plain with charset=utf-8 for .txt', async () => {
    fs.writeFileSync(path.join(rootDir, 'note.txt'), 'hi')
    const res = await request(buildApp()).get('/api/asset?root=0&path=note.txt')
    expect(res.headers['content-type']).toContain('charset=utf-8')
  })

  it('GET /api/asset returns 404 for a missing file', async () => {
    const res = await request(buildApp()).get('/api/asset?root=0&path=missing.png')
    expect(res.status).toBe(404)
  })

  it('GET /api/asset returns 404 (not a crash) when path is a directory', async () => {
    fs.mkdirSync(path.join(rootDir, 'subdir'))
    const res = await request(buildApp()).get('/api/asset?root=0&path=subdir')
    expect(res.status).toBe(404)
    expect(res.body.errorCode).toBe('FILE_NOT_FOUND')
  })
})
