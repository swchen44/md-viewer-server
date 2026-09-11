import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
    vi.stubEnv('XDG_CONFIG_HOME', configHome)
    vi.stubEnv('XDG_STATE_HOME', stateHome)
    vi.stubEnv('MVS_E2E_BIND_HOST', undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it.each([
    { name: 'normal daemon', bindHost: undefined, address: '0.0.0.0' },
    { name: 'E2E fixture', bindHost: '127.0.0.1', address: '127.0.0.1' },
  ])('binds the $name to $address, writes a pid file, and responds to /api/health', async ({ bindHost, address }) => {
    vi.stubEnv('MVS_E2E_BIND_HOST', bindHost)
    const appConfigDir = path.join(configHome, 'md-viewer-server')
    fs.mkdirSync(appConfigDir, { recursive: true })
    loadOrCreateConfig(appConfigDir, { roots: ['/tmp/project'], port: 0 })

    const server = startServer({ logLevel: 'error' })
    try {
      await new Promise((resolve) => server.once('listening', resolve))
      expect(server.address().address).toBe(address)
      const { port } = server.address()

      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      const body = await res.json()
      expect(body.service).toBe('md-viewer-server')
      expect(body.roots).toEqual(['/tmp/project'])

      const pidPath = path.join(stateHome, 'md-viewer-server', 'server.pid')
      expect(fs.existsSync(pidPath)).toBe(true)
      expect(fs.readFileSync(pidPath, 'utf8')).toBe(String(process.pid))
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it.each(['', '0.0.0.0', 'localhost'])('rejects an unsafe or ambiguous E2E bind host %j before listening', (bindHost) => {
    vi.stubEnv('MVS_E2E_BIND_HOST', bindHost)
    expect(() => startServer({ logLevel: 'error' })).toThrow('MVS_E2E_BIND_HOST must be 127.0.0.1')
  })
})
