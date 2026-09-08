import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { resolvePathToRoot, runOpenFile } from '../../../src/server/commands/open-file.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'
import { getConfigDir } from '../../../src/server/xdg-paths.js'

describe('resolvePathToRoot', () => {
  const roots = [
    { id: 0, path: '/home/user/projectA' },
    { id: 1, path: '/home/user/projectB' },
  ]

  it('resolves an absolute path under a configured root', () => {
    const result = resolvePathToRoot('/home/user/projectB/docs/readme.md', roots)
    expect(result).toEqual({ rootId: 1, relPath: path.join('docs', 'readme.md') })
  })

  it('resolves a path relative to the given cwd', () => {
    const result = resolvePathToRoot('docs/readme.md', roots, '/home/user/projectA')
    expect(result).toEqual({ rootId: 0, relPath: path.join('docs', 'readme.md') })
  })

  it('returns null when the path is not under any configured root', () => {
    const result = resolvePathToRoot('/etc/passwd', roots)
    expect(result).toBeNull()
  })

  it('resolves the root directory itself to an empty relPath', () => {
    const result = resolvePathToRoot('/home/user/projectA', roots)
    expect(result).toEqual({ rootId: 0, relPath: '' })
  })
})

describe('runOpenFile', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'open-file-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'open-file-state-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.XDG_STATE_HOME = stateHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('reports not-configured when config.json does not exist', async () => {
    const result = await runOpenFile('/tmp/some-root/file.md')
    expect(result.outcome).toBe('not-configured')
  })

  it('reports not-running when health check fails', async () => {
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port: 5997 })
    const result = await runOpenFile('/tmp/a/file.md')
    expect(result.outcome).toBe('not-running')
  })

  function buildFakeDaemon(handlePost) {
    return http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.url === '/api/health') {
        res.end(
          JSON.stringify({ service: 'md-viewer-server', version: '0.1.0', uptime: 1, roots: [] })
        )
        return
      }
      if (req.url === '/api/tabs' && req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => handlePost(JSON.parse(body), res))
        return
      }
      res.statusCode = 404
      res.end()
    })
  }

  it('calls POST /api/tabs and reports "opened" with rootId/relPath on success', async () => {
    const server = buildFakeDaemon((body, res) => {
      expect(body).toEqual({ root: 0, path: 'file.md' })
      res.statusCode = 201
      res.end(JSON.stringify({ rootId: 0, relPath: 'file.md' }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runOpenFile('/tmp/a/file.md')
    expect(result).toEqual({ outcome: 'opened', rootId: 0, relPath: 'file.md' })

    server.close()
  })

  it('resolves a relative inputPath against the passed-in cwd, not the daemon-configured root order', async () => {
    const server = buildFakeDaemon((body, res) => {
      expect(body).toEqual({ root: 1, path: 'notes.md' })
      res.statusCode = 201
      res.end(JSON.stringify({ rootId: 1, relPath: 'notes.md' }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a', '/tmp/b'], port })

    const result = await runOpenFile('notes.md', { cwd: '/tmp/b' })
    expect(result).toEqual({ outcome: 'opened', rootId: 1, relPath: 'notes.md' })

    server.close()
  })

  it('sends the configured auth token as X-Auth-Token', async () => {
    let receivedToken
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.url === '/api/health') {
        res.end(
          JSON.stringify({ service: 'md-viewer-server', version: '0.1.0', uptime: 1, roots: [] })
        )
        return
      }
      if (req.url === '/api/tabs' && req.method === 'POST') {
        receivedToken = req.headers['x-auth-token']
        res.statusCode = 201
        res.end(JSON.stringify({ rootId: 0, relPath: 'file.md' }))
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    const config = loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    await runOpenFile('/tmp/a/file.md')
    expect(receivedToken).toBe(config.token)

    server.close()
  })

  // The one behavior specifically worth locking down: `open` must never
  // trigger POST /api/roots (the dynamic add-root endpoint) as a side
  // effect, even though it could technically "fix" the situation itself.
  // Expanding the daemon's filesystem access must always be an explicit,
  // separate action the user/agent takes via `add-root`.
  it('reports path-outside-roots and never calls POST /api/roots when the path is not under any configured root', async () => {
    let rootsCallMade = false
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.url === '/api/health') {
        res.end(
          JSON.stringify({ service: 'md-viewer-server', version: '0.1.0', uptime: 1, roots: [] })
        )
        return
      }
      if (req.url === '/api/roots') {
        rootsCallMade = true
        res.statusCode = 201
        res.end(JSON.stringify({ id: 99, name: 'sneaky' }))
        return
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    // Belt-and-suspenders: also spy on global fetch directly so this test
    // fails even if some future refactor bypasses the fake daemon's own
    // routing (e.g. by calling fetch with a different base URL).
    const realFetch = globalThis.fetch
    const fetchSpy = vi.fn((...args) => realFetch(...args))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await runOpenFile('/somewhere/outside/every/root.md')
    expect(result.outcome).toBe('path-outside-roots')
    expect(rootsCallMade).toBe(false)
    for (const call of fetchSpy.mock.calls) {
      expect(String(call[0])).not.toContain('/api/roots')
    }

    server.close()
  })
})
