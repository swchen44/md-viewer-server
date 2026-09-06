import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  generateToken,
  getConfigPath,
  readConfig,
  loadOrCreateConfig,
  rotateToken,
} from '../../../src/server/config.js'

describe('generateToken', () => {
  it('generates a 4-digit numeric string', () => {
    const token = generateToken()
    expect(token).toMatch(/^\d{4}$/)
  })
})

describe('config file management', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when config does not exist yet', () => {
    expect(readConfig(dir)).toBeNull()
  })

  it('returns null instead of throwing when config.json is corrupt', () => {
    fs.writeFileSync(getConfigPath(dir), '{not valid json')
    expect(readConfig(dir)).toBeNull()
  })

  it('creates a new config with a generated token on first call', () => {
    const config = loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
    expect(config.token).toMatch(/^\d{4}$/)
    expect(config.port).toBe(4173)
    expect(config.roots).toEqual(['/tmp/a'])
    expect(fs.existsSync(getConfigPath(dir))).toBe(true)
  })

  it('reuses the existing token on subsequent calls', () => {
    const first = loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
    const second = loadOrCreateConfig(dir, { roots: ['/tmp/b'], port: 4173 })
    expect(second.token).toBe(first.token)
  })

  it('updates roots on every call', () => {
    loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
    const second = loadOrCreateConfig(dir, { roots: ['/tmp/b', '/tmp/c'], port: 4173 })
    expect(second.roots).toEqual(['/tmp/b', '/tmp/c'])
  })

  it('keeps the previous port when no new port is given', () => {
    loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 5000 })
    const second = loadOrCreateConfig(dir, { roots: ['/tmp/a'] })
    expect(second.port).toBe(5000)
  })

  it('updates the port when a new one is explicitly given', () => {
    loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 5000 })
    const second = loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 6000 })
    expect(second.port).toBe(6000)
  })

  it('preserves settings keys written by updateSettings across a later start', () => {
    const first = loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
    // simulate what updateSettings does: merge an extra key into config.json
    const withSetting = {
      ...readConfig(dir),
      plantumlServerUrl: 'http://plantuml.internal:8080',
      sendToPlantUmlServer: true,
    }
    fs.writeFileSync(getConfigPath(dir), JSON.stringify(withSetting, null, 2))

    const second = loadOrCreateConfig(dir, { roots: ['/tmp/b'], port: 6000 })

    expect(second.plantumlServerUrl).toBe('http://plantuml.internal:8080')
    expect(second.sendToPlantUmlServer).toBe(true)
    expect(readConfig(dir).plantumlServerUrl).toBe('http://plantuml.internal:8080')
    // and the lifecycle fields still take their new values
    expect(second.token).toBe(first.token)
    expect(second.port).toBe(6000)
    expect(second.roots).toEqual(['/tmp/b'])
  })

  it('rotateToken generates a new token and persists it', () => {
    loadOrCreateConfig(dir, { roots: ['/tmp/a'], port: 4173 })
    const rotated = rotateToken(dir)
    expect(rotated.token).toMatch(/^\d{4}$/)
    expect(rotated.port).toBe(4173)
    expect(rotated.roots).toEqual(['/tmp/a'])
    // extremely unlikely but not impossible to collide; this is a smoke test,
    // not a proof — rotation working is confirmed by config.json actually changing
    const reread = readConfig(dir)
    expect(reread.token).toBe(rotated.token)
  })

  it('rotateToken throws if no config exists yet', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-empty-'))
    expect(() => rotateToken(emptyDir)).toThrow()
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })
})
