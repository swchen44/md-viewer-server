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

  // Express's own default query parser ('extended') calls qs.parse with
  // arrayLimit overridden to 1000 (see express/lib/utils.js
  // parseExtendedQueryString), not qs's own out-of-the-box default of 20 —
  // so this app doesn't actually flip `openPaths` into an object until past
  // 1000 repeated params, not past 20. The route handler still must not
  // assume any particular array-vs-object shape, though: a custom query
  // parser, a future express/qs upgrade, or simply enough open tabs to blow
  // past whatever limit is configured could all produce the object shape.
  // This app pins the parser to reproduce that overflow shape at a much
  // smaller, fast-to-test count (21+), matching qs's documented default
  // `arrayLimit` behavior, so the route's own normalization is what's under
  // test here rather than this app's specific configuration.
  function buildAppWithLowArrayLimitQueryParser() {
    const app = express()
    const ARRAY_LIMIT = 20
    app.set('query parser', (str) => {
      const query = {}
      for (const [key, value] of new URLSearchParams(str)) {
        if (query[key] === undefined) {
          query[key] = value
        } else if (Array.isArray(query[key])) {
          query[key].push(value)
        } else {
          query[key] = [query[key], value]
        }
      }
      if (Array.isArray(query.openPaths) && query.openPaths.length > ARRAY_LIMIT) {
        query.openPaths = Object.fromEntries(query.openPaths.map((v, i) => [i, v]))
      }
      return query
    })
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

  it('does not corrupt an openPaths value containing a literal comma', async () => {
    fs.writeFileSync(path.join(rootDir, 'a,b.md'), '# A,B\n\ncomma content here')
    const res = await request(buildApp()).get(
      `/api/search?root=0&q=comma&target=content&scope=open&openPaths=${encodeURIComponent('a,b.md')}`
    )
    expect(res.status).toBe(200)
    const paths = res.body.contentMatches.map((m) => m.relPath)
    expect(paths).toContain('a,b.md')
  })

  it('handles a comma-containing relPath among repeated openPaths query params', async () => {
    fs.writeFileSync(path.join(rootDir, 'a,b.md'), '# A,B\n\ncomma content here')
    const res = await request(buildApp()).get(
      `/api/search?root=0&q=e&target=content&scope=open&openPaths=${encodeURIComponent('a,b.md')}&openPaths=readme.md`
    )
    expect(res.status).toBe(200)
    const paths = res.body.contentMatches.map((m) => m.relPath).sort()
    expect(paths).toEqual(['a,b.md', 'readme.md'])
  })

  it('finds matches in files past the 20th openPaths param when the query parser overflows to an object', async () => {
    // qs's documented default arrayLimit is 20: the 21st+ repeated
    // `openPaths` value flips qs from building an array to building a plain
    // object keyed by index instead. Use 25 distinct open tabs (well past the
    // limit) to prove all of them still resolve, not just the first 20 — and
    // not "[object Object]" for the lot, which is what happens when the
    // object is wrapped as a single array element instead of being unpacked.
    const relPaths = []
    for (let i = 1; i <= 25; i++) {
      const name = `tab${i}.md`
      fs.writeFileSync(path.join(rootDir, name), `# Tab ${i}\n\nneedle content ${i}`)
      relPaths.push(name)
    }
    const openPathsQs = relPaths.map((p) => `openPaths=${encodeURIComponent(p)}`).join('&')
    const res = await request(buildAppWithLowArrayLimitQueryParser()).get(
      `/api/search?root=0&q=needle&target=content&scope=open&${openPathsQs}`
    )
    expect(res.status).toBe(200)
    const paths = res.body.contentMatches.map((m) => m.relPath).sort()
    expect(paths).toEqual([...relPaths].sort())
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
