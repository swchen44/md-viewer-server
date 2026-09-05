import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  generateToken,
  getConfigPath,
  readConfig,
  loadOrCreateConfig,
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
})
