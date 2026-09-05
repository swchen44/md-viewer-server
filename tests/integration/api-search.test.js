import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSearchRouter } from '../../src/server/api/search.js'

describe('search and outline API', () => {
  let rootDir
  let roots

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-search-'))
    fs.writeFileSync(path.join(rootDir, 'plan.md'), '# Plan\n\nfind this phrase here\n\n## Details')
    fs.writeFileSync(path.join(rootDir, 'readme.md'), '# Readme\n\nnothing relevant')
    roots = [{ id: 0, path: rootDir, name: 'root0' }]
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  function buildApp() {
    const app = express()
    app.use('/api', createSearchRouter(roots, ['.md']))
    return app
  }

  it('searches file names', async () => {
    const res = await request(buildApp()).get('/api/search?root=0&q=plan&target=name')
    expect(res.status).toBe(200)
    expect(res.body.fileMatches).toEqual([expect.objectContaining({ relPath: 'plan.md' })])
    expect(res.body.contentMatches).toEqual([])
  })

  it('searches file contents', async () => {
    const res = await request(buildApp()).get(
      '/api/search?root=0&q=find+this+phrase&target=content'
    )
    expect(res.status).toBe(200)
    expect(res.body.contentMatches).toEqual([
      expect.objectContaining({ relPath: 'plan.md' }),
    ])
  })

  it('searches both name and content when target=both', async () => {
    const res = await request(buildApp()).get('/api/search?root=0&q=plan&target=both')
    expect(res.body.fileMatches.length).toBeGreaterThan(0)
  })

  it('restricts content search to openPaths when scope=open', async () => {
    const res = await request(buildApp()).get(
      '/api/search?root=0&q=e&target=content&scope=open&openPaths=readme.md'
    )
    // "e" appears in both files' content, but scope=open should only search readme.md
    const paths = res.body.contentMatches.map((m) => m.relPath)
    expect(paths).not.toContain('plan.md')
  })

  it('returns empty results for scope=open when openPaths is not provided', async () => {
    const res = await request(buildApp()).get(
      '/api/search?root=0&q=e&target=both&scope=open'
    )
    expect(res.status).toBe(200)
    expect(res.body.fileMatches).toEqual([])
    expect(res.body.contentMatches).toEqual([])
  })

  it('returns empty results for an empty query', async () => {
    const res = await request(buildApp()).get('/api/search?root=0&q=&target=both')
    expect(res.status).toBe(200)
    expect(res.body.fileMatches).toEqual([])
    expect(res.body.contentMatches).toEqual([])
  })

  it('returns 400 for an invalid regex', async () => {
    const res = await request(buildApp()).get(
      '/api/search?root=0&q=(unclosed&target=name&regex=true'
    )
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('INVALID_REGEX')
  })

  it('returns outline headings for a file', async () => {
    const res = await request(buildApp()).get('/api/outline?root=0&path=plan.md')
    expect(res.status).toBe(200)
    expect(res.body.headings).toEqual([
      { level: 1, text: 'Plan', line: 1 },
      { level: 2, text: 'Details', line: 5 },
    ])
  })

  it('returns 404 for outline of a missing file', async () => {
    const res = await request(buildApp()).get('/api/outline?root=0&path=missing.md')
    expect(res.status).toBe(404)
  })

  it('rejects a path-traversal attempt on outline with 400', async () => {
    const res = await request(buildApp()).get('/api/outline?root=0&path=../../../etc/passwd')
    expect(res.status).toBe(400)
    expect(res.body.errorCode).toBe('UNSAFE_PATH')
  })
})
