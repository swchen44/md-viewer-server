import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runAddRoot } from '../../../src/server/commands/add-root.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'
import { getConfigDir } from '../../../src/server/xdg-paths.js'

describe('runAddRoot', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'add-root-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'add-root-state-'))
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
    const result = await runAddRoot('/tmp/new-root')
    expect(result.outcome).toBe('not-configured')
  })

  it('reports not-running when health check fails', async () => {
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port: 5996 })
    const result = await runAddRoot('/tmp/new-root')
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
      if (req.url === '/api/roots' && req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', () => handlePost(JSON.parse(body), res))
        return
      }
      res.statusCode = 404
      res.end()
    })
  }

  it('calls POST /api/roots and reports "added" with the new root id and name on success', async () => {
    const server = buildFakeDaemon((body, res) => {
      expect(body).toEqual({ path: '/tmp/new-root' })
      res.statusCode = 201
      res.end(JSON.stringify({ id: 1, name: 'new-root' }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runAddRoot('/tmp/new-root')
    expect(result).toEqual({ outcome: 'added', rootId: 1, name: 'new-root' })

    server.close()
  })

  it('reports "invalid-path" when the daemon returns 400 INVALID_ROOT_PATH', async () => {
    const server = buildFakeDaemon((_body, res) => {
      res.statusCode = 400
      res.end(JSON.stringify({ errorCode: 'INVALID_ROOT_PATH' }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runAddRoot('/does/not/exist')
    expect(result.outcome).toBe('invalid-path')

    server.close()
  })

  it('reports "overlaps-existing" with the conflicting root id when the daemon returns 409', async () => {
    const server = buildFakeDaemon((_body, res) => {
      res.statusCode = 409
      res.end(JSON.stringify({ errorCode: 'ROOT_OVERLAPS_EXISTING', existingRootId: 0 }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runAddRoot('/tmp/a/subdir')
    expect(result).toEqual({ outcome: 'overlaps-existing', existingRootId: 0 })

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
      if (req.url === '/api/roots' && req.method === 'POST') {
        receivedToken = req.headers['x-auth-token']
        res.statusCode = 201
        res.end(JSON.stringify({ id: 1, name: 'new-root' }))
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    const config = loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    await runAddRoot('/tmp/new-root')
    expect(receivedToken).toBe(config.token)

    server.close()
  })
})
