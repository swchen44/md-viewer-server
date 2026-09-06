import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { runDoctor } from '../../src/server/doctor.js'
import { loadOrCreateConfig } from '../../src/server/config.js'
import { updateSettings } from '../../src/server/settings.js'

// Every test in this file points plantumlServerUrl at a local, immediately-refusing
// address by default, so runDoctor's plantuml-reachable check never makes a real
// network request to the internet. Tests that want to exercise a different scenario
// (e.g. a reachable fake server) override it explicitly.
const UNREACHABLE_PLANTUML_URL = 'http://127.0.0.1:1'

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
    updateSettings(configDir, { plantumlServerUrl: UNREACHABLE_PLANTUML_URL })
    const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5990 })
    const rootCheck = results.find((r) => r.name === 'root-accessible')
    expect(rootCheck.status).toBe('ok')
  })

  it('reports fail for a nonexistent root', async () => {
    const missingRoot = path.join(rootDir, 'does-not-exist')
    loadOrCreateConfig(configDir, { roots: [missingRoot], port: 5990 })
    updateSettings(configDir, { plantumlServerUrl: UNREACHABLE_PLANTUML_URL })
    const results = await runDoctor({ configDir, stateDir, roots: [missingRoot], port: 5990 })
    const rootCheck = results.find((r) => r.name === 'root-accessible')
    expect(rootCheck.status).toBe('fail')
  })

  it('reports not-running for daemon-status when nothing is listening', async () => {
    loadOrCreateConfig(configDir, { roots: [rootDir], port: 5991 })
    updateSettings(configDir, { plantumlServerUrl: UNREACHABLE_PLANTUML_URL })
    const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5991 })
    const daemonCheck = results.find((r) => r.name === 'daemon-running')
    expect(daemonCheck.status).toBe('warn')
  })

  it('reports ok for config validity when config.json is well-formed', async () => {
    loadOrCreateConfig(configDir, { roots: [rootDir], port: 5992 })
    updateSettings(configDir, { plantumlServerUrl: UNREACHABLE_PLANTUML_URL })
    const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5992 })
    const configCheck = results.find((r) => r.name === 'config-valid')
    expect(configCheck.status).toBe('ok')
  })

  it('includes all 11 expected checks', async () => {
    loadOrCreateConfig(configDir, { roots: [rootDir], port: 5993 })
    updateSettings(configDir, { plantumlServerUrl: UNREACHABLE_PLANTUML_URL })
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
      'plantuml-reachable',
      'disk-space',
    ])
  })

  it('reports the configured (non-default) PlantUML server URL reachability, not a hardcoded one', async () => {
    loadOrCreateConfig(configDir, { roots: [rootDir], port: 5994 })
    updateSettings(configDir, { plantumlServerUrl: UNREACHABLE_PLANTUML_URL })
    const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5994 })
    const plantUmlCheck = results.find((r) => r.name === 'plantuml-reachable')
    expect(plantUmlCheck.message).toContain('127.0.0.1:1')
    expect(plantUmlCheck.status).toBe('warn')
  })

  it('reports ok for plantuml-reachable when the configured server responds', async () => {
    const fakeUpstream = http.createServer((req, res) => {
      res.statusCode = 200
      res.end('ok')
    })
    await new Promise((resolve) => fakeUpstream.listen(0, '127.0.0.1', resolve))
    const fakeUpstreamPort = fakeUpstream.address().port

    try {
      loadOrCreateConfig(configDir, { roots: [rootDir], port: 5995 })
      updateSettings(configDir, { plantumlServerUrl: `http://127.0.0.1:${fakeUpstreamPort}` })
      const results = await runDoctor({ configDir, stateDir, roots: [rootDir], port: 5995 })
      const plantUmlCheck = results.find((r) => r.name === 'plantuml-reachable')
      expect(plantUmlCheck.status).toBe('ok')
      expect(plantUmlCheck.message).toContain(`127.0.0.1:${fakeUpstreamPort}`)
    } finally {
      await new Promise((resolve) => fakeUpstream.close(resolve))
    }
  })
})
