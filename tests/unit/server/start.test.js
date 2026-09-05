import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { runStart } from '../../../src/server/commands/start.js'

describe('runStart', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'start-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'start-state-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.XDG_STATE_HOME = stateHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it('skips roots that do not exist and reports no-valid-roots if none are valid', async () => {
    const result = await runStart({ roots: ['/does/not/exist'], port: 5999 })
    expect(result.outcome).toBe('no-valid-roots')
    expect(result.skippedRoots).toEqual(['/does/not/exist'])
  })

  it('detects an already-running server via health check instead of spawning a new one', async () => {
    const validRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'start-root-'))
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          service: 'md-viewer-server',
          version: '0.1.0',
          uptime: 99,
          roots: [validRoot],
        })
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port

    const result = await runStart({ roots: [validRoot], port })
    expect(result.outcome).toBe('already-running')
    expect(result.uptime).toBe(99)

    server.close()
    fs.rmSync(validRoot, { recursive: true, force: true })
  })
})
