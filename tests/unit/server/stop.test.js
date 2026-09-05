import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runStop } from '../../../src/server/commands/stop.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'
import { getConfigDir } from '../../../src/server/xdg-paths.js'

describe('runStop', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-state-'))
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
    const result = await runStop()
    expect(result.outcome).toBe('not-configured')
  })

  it('reports not-running when health check fails', async () => {
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port: 5997 })
    const result = await runStop()
    expect(result.outcome).toBe('not-running')
  })

  it('stops via the shutdown API when the server responds to health checks', async () => {
    let shutdownCalled = false
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.url === '/api/health') {
        if (shutdownCalled) {
          res.statusCode = 503
          res.end()
        } else {
          res.end(
            JSON.stringify({ service: 'md-viewer-server', version: '0.1.0', uptime: 1, roots: [] })
          )
        }
      } else if (req.url === '/api/shutdown' && req.method === 'POST') {
        shutdownCalled = true
        res.end(JSON.stringify({ status: 'shutting-down' }))
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runStop()
    expect(result.outcome).toBe('stopped')
    expect(result.via).toBe('api')

    server.close()
  })
})
