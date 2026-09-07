import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../../src/server/app.js'

describe('GET /api/file-path', () => {
  let testRoot
  let app
  const token = '1234'

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'api-file-path-'))
    fs.mkdirSync(path.join(testRoot, 'notes'))
    fs.writeFileSync(path.join(testRoot, 'notes', 'a.md'), '# A')

    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    app = createApp({
      config: { token, roots: [testRoot] },
      logger,
      getUptimeSeconds: () => 0,
      packageVersion: '0.0.0',
      onShutdown: vi.fn(),
      roots: [{ id: 0, path: testRoot, name: path.basename(testRoot) }],
    })
  })

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it('returns the real absolute path for a file under a valid root', async () => {
    const res = await request(app)
      .get(`/api/file-path?root=0&path=notes/a.md`)
      .set('X-Auth-Token', token)
    expect(res.status).toBe(200)
    expect(res.body.absolutePath).toBe(path.join(testRoot, 'notes/a.md'))
  })

  it('returns 404 ROOT_NOT_FOUND for an unknown root id', async () => {
    const res = await request(app).get(`/api/file-path?root=999&path=a.md`).set('X-Auth-Token', token)
    expect(res.status).toBe(404)
    expect(res.body.errorCode).toBe('ROOT_NOT_FOUND')
  })

  it('returns 400 UNSAFE_PATH for a path-traversal attempt', async () => {
    const res = await request(app)
      .get(`/api/file-path?root=0&path=../../../etc/passwd`)
      .set('X-Auth-Token', token)
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('UNSAFE_PATH')
  })

  it('requires auth', async () => {
    const res = await request(app).get(`/api/file-path?root=0&path=a.md`)
    expect(res.status).toBe(401)
  })
})
