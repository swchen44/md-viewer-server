import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runDoctor } from '../../src/server/doctor.js'
import { loadOrCreateConfig } from '../../src/server/config.js'

describe('runDoctor', () => {
  let configDir
  let stateDir
  let rootDir

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-config-'))
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-state-'))
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-root-'))
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
    fs.rmSync(stateDir, { recursive: true, force: true })
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  it('reports ok for a valid, readable/writable root', async () => {
    loadOrCreateConfig(configDir, { roots: [rootDir], port: 5990 })
    const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5990 })
    const rootCheck = results.find((r) => r.name === 'root-accessible')
    expect(rootCheck.status).toBe('ok')
  })

  it('reports fail for a nonexistent root', async () => {
    const missingRoot = path.join(rootDir, 'does-not-exist')
    loadOrCreateConfig(configDir, { roots: [missingRoot], port: 5990 })
    const results = await runDoctor({ configDir, stateDir, roots: [missingRoot], port: 5990 })
    const rootCheck = results.find((r) => r.name === 'root-accessible')
    expect(rootCheck.status).toBe('fail')
  })

  it('reports not-running for daemon-status when nothing is listening', async () => {
    loadOrCreateConfig(configDir, { roots: [rootDir], port: 5991 })
    const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5991 })
    const daemonCheck = results.find((r) => r.name === 'daemon-running')
    expect(daemonCheck.status).toBe('warn')
  })

  it('reports ok for config validity when config.json is well-formed', async () => {
    loadOrCreateConfig(configDir, { roots: [rootDir], port: 5992 })
    const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5992 })
    const configCheck = results.find((r) => r.name === 'config-valid')
    expect(configCheck.status).toBe('ok')
  })

  it('includes all 10 expected checks', async () => {
    loadOrCreateConfig(configDir, { roots: [rootDir], port: 5993 })
    const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5993 })
    const names = results.map((r) => r.name)
    expect(names).toEqual([
      'node-version',
      'bundle-integrity',
      'xdg-dirs',
      'config-valid',
      'root-accessible',
      'daemon-running',
      'port-available',
      'stale-pid',
      'inotify-limit',
      'disk-space',
    ])
  })
})
