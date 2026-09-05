import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runStatus } from '../../../src/server/commands/status.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'
import { getConfigDir } from '../../../src/server/xdg-paths.js'

describe('runStatus', () => {
  let configHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'status-config-'))
    process.env.XDG_CONFIG_HOME = configHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
  })

  it('reports not-configured when config.json does not exist', async () => {
    const result = await runStatus()
    expect(result.outcome).toBe('not-configured')
  })

  it('reports not-running when config exists but health check fails', async () => {
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port: 5998 })
    const result = await runStatus()
    expect(result.outcome).toBe('not-running')
    expect(result.port).toBe(5998)
  })

  it('reports running with uptime and roots when health check succeeds', async () => {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          service: 'md-viewer-server',
          version: '0.1.0',
          uptime: 42,
          roots: ['/tmp/a'],
        })
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    loadOrCreateConfig(getConfigDir(), { roots: ['/tmp/a'], port })

    const result = await runStatus()
    expect(result.outcome).toBe('running')
    expect(result.uptime).toBe(42)

    server.close()
  })
})
