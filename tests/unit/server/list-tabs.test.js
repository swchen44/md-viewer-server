import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runListTabs } from '../../../src/server/commands/list-tabs.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'
import { getConfigDir } from '../../../src/server/xdg-paths.js'

describe('runListTabs', () => {
  let configHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'list-tabs-config-'))
    process.env.XDG_CONFIG_HOME = configHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
  })

  it('reports not-configured when config.json does not exist', async () => {
    const result = await runListTabs()
    expect(result.outcome).toBe('not-configured')
  })

  it('reports not-running when health check fails', async () => {
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port: 5998 })
    const result = await runListTabs()
    expect(result.outcome).toBe('not-running')
  })

  function buildFakeDaemon({ tabs = [], roots = [] } = {}) {
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
      if (req.url === '/api/roots' && req.method === 'GET') {
        res.end(JSON.stringify(roots))
        return
      }
      res.statusCode = 404
      res.end()
    })
  }

  it('reports listed with an empty array when no tabs are open', async () => {
    const server = buildFakeDaemon({ tabs: [], roots: [{ id: 0, name: 'a' }] })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runListTabs()

    expect(result).toEqual({ outcome: 'listed', tabs: [] })

    server.close()
  })

  it('joins tabs with root names fetched from GET /api/roots', async () => {
    const server = buildFakeDaemon({
      tabs: [
        { rootId: 0, relPath: 'notes.md' },
        { rootId: 1, relPath: path.join('sub', 'todo.md') },
      ],
      roots: [
        { id: 0, name: 'project-a' },
        { id: 1, name: 'project-b' },
      ],
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a', '/tmp/b'], port })

    const result = await runListTabs()

    expect(result).toEqual({
      outcome: 'listed',
      tabs: [
        { rootId: 0, relPath: 'notes.md', rootName: 'project-a' },
        { rootId: 1, relPath: path.join('sub', 'todo.md'), rootName: 'project-b' },
      ],
    })

    server.close()
  })

  it('falls back to a synthetic name when a tab references a root id not present in GET /api/roots', async () => {
    const server = buildFakeDaemon({
      tabs: [{ rootId: 5, relPath: 'orphan.md' }],
      roots: [{ id: 0, name: 'project-a' }],
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runListTabs()

    expect(result).toEqual({
      outcome: 'listed',
      tabs: [{ rootId: 5, relPath: 'orphan.md', rootName: 'root 5' }],
    })

    server.close()
  })
})
