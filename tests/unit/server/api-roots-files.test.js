import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRootsRouter } from '../../../src/server/api/roots.js'
import { createFilesRouter } from '../../../src/server/api/files.js'

describe('roots and files API', () => {
  let rootDir
  let roots

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-roots-'))
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'hello')
    roots = [{ id: 0, path: rootDir, name: path.basename(rootDir) }]
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  function buildApp() {
    const app = express()
    app.use('/api', createRootsRouter(roots))
    app.use('/api', createFilesRouter(roots, ['.md']))
    return app
  }

  it('GET /api/roots lists configured roots', async () => {
    const res = await request(buildApp()).get('/api/roots')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 0, name: path.basename(rootDir) }])
  })

  it('GET /api/files?root=0 lists matching files', async () => {
    const res = await request(buildApp()).get('/api/files?root=0')
    expect(res.status).toBe(200)
    expect(res.body.files).toEqual([
      expect.objectContaining({ relPath: 'a.md', size: 5 }),
    ])
  })

  it('GET /api/files?root=99 (unknown root) returns 404', async () => {
    const res = await request(buildApp()).get('/api/files?root=99')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ errorCode: 'ROOT_NOT_FOUND' })
  })
})
