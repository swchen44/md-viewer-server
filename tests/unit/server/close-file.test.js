import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runCloseFile } from '../../../src/server/commands/close-file.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'
import { getConfigDir } from '../../../src/server/xdg-paths.js'

describe('runCloseFile', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'close-file-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'close-file-state-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.XDG_STATE_HOME = stateHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it('reports not-configured when config.json does not exist', async () => {
    const result = await runCloseFile('/tmp/some-root/file.md')
    expect(result.outcome).toBe('not-configured')
  })

  it('reports not-running when health check fails', async () => {
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port: 5998 })
    const result = await runCloseFile('/tmp/a/file.md')
    expect(result.outcome).toBe('not-running')
  })

  function buildFakeDaemon({ tabs = [], onDelete } = {}) {
    return http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.url === '/api/health') {
        res.end(
          JSON.stringify({ service: 'md-viewer-server', version: '0.1.0', uptime: 1, roots: [] })
        )
        return
      }
      if (req.url === '/api/tabs' && req.method === 'GET') {
        res.end(JSON.stringify(tabs))
        return
      }
      if (req.url === '/api/tabs' && req.method === 'DELETE') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => {
          onDelete?.(JSON.parse(body))
          res.statusCode = 200
          res.end(JSON.stringify({}))
        })
        return
      }
      res.statusCode = 404
      res.end()
    })
  }

  it('closes the exact tab when inputPath resolves to a concrete root (explicit path takes precedence, no fuzzy matching)', async () => {
    let deletedBody
    const server = buildFakeDaemon({
      tabs: [
        { rootId: 0, relPath: 'file.md' },
        { rootId: 0, relPath: path.join('sub', 'file.md') },
      ],
      onDelete: (body) => {
        deletedBody = body
      },
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runCloseFile('/tmp/a/file.md')

    expect(result).toEqual({ outcome: 'closed', rootId: 0, relPath: 'file.md' })
    expect(deletedBody).toEqual({ root: 0, path: 'file.md' })

    server.close()
  })

  it('falls back to basename matching when inputPath is a bare filename, closing the single unique match', async () => {
    let deletedBody
    const server = buildFakeDaemon({
      tabs: [
        { rootId: 0, relPath: path.join('sub', 'unique.md') },
        { rootId: 0, relPath: 'other.md' },
      ],
      onDelete: (body) => {
        deletedBody = body
      },
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    // 'unique.md' is not a valid path under /tmp/a relative to an unrelated
    // cwd, so resolvePathToRoot should fail to resolve it and this should
    // fall back to basename matching against the open-tabs list.
    const result = await runCloseFile('unique.md', { cwd: '/somewhere/else' })

    expect(result).toEqual({
      outcome: 'closed',
      rootId: 0,
      relPath: path.join('sub', 'unique.md'),
    })
    expect(deletedBody).toEqual({ root: 0, path: path.join('sub', 'unique.md') })

    server.close()
  })

  it('reports not-found when a bare filename matches no open tab', async () => {
    const server = buildFakeDaemon({ tabs: [{ rootId: 0, relPath: 'other.md' }] })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runCloseFile('missing.md', { cwd: '/somewhere/else' })

    expect(result).toEqual({ outcome: 'not-found' })

    server.close()
  })

  it('reports ambiguous with full candidate paths when a bare filename matches multiple open tabs', async () => {
    const server = buildFakeDaemon({
      tabs: [
        { rootId: 0, relPath: path.join('a', 'dup.md') },
        { rootId: 0, relPath: path.join('b', 'dup.md') },
      ],
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runCloseFile('dup.md', { cwd: '/somewhere/else' })

    expect(result).toEqual({
      outcome: 'ambiguous',
      candidates: [
        { rootId: 0, relPath: path.join('a', 'dup.md') },
        { rootId: 0, relPath: path.join('b', 'dup.md') },
      ],
    })

    server.close()
  })
})
