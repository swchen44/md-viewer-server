import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadOrCreateConfig } from '../../src/server/config.js'
import { startServer } from '../../src/server/entry.js'

describe('server entry', () => {
  let configHome
  let stateHome

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-state-'))
    process.env.XDG_CONFIG_HOME = configHome
    process.env.XDG_STATE_HOME = stateHome
  })

  afterEach(() => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it('starts listening, writes a pid file, and responds to /api/health', async () => {
    const appConfigDir = path.join(configHome, 'md-viewer-server')
    fs.mkdirSync(appConfigDir, { recursive: true })
    loadOrCreateConfig(appConfigDir, { roots: ['/tmp/project'], port: 0 })

    const server = startServer({ logLevel: 'error' })
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address()

    const res = await fetch(`http://127.0.0.1:${port}/api/health`)
    const body = await res.json()
    expect(body.service).toBe('md-viewer-server')
    expect(body.roots).toEqual(['/tmp/project'])

    const pidPath = path.join(stateHome, 'md-viewer-server', 'server.pid')
    expect(fs.existsSync(pidPath)).toBe(true)
    expect(fs.readFileSync(pidPath, 'utf8')).toBe(String(process.pid))

    await new Promise((resolve) => server.close(resolve))
  })
})
