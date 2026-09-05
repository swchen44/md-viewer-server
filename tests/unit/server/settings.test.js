import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSettings, updateSettings } from '../../../src/server/settings.js'
import { loadOrCreateConfig } from '../../../src/server/config.js'

describe('settings', () => {
  let configDir

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'))
    loadOrCreateConfig(configDir, { roots: ['/tmp/a'], port: 4173 })
  })

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  it('returns the default PlantUML server URL when not set', () => {
    const settings = readSettings(configDir)
    expect(settings.plantumlServerUrl).toBe('https://www.plantuml.com/plantuml')
  })

  it('persists an updated PlantUML server URL', () => {
    updateSettings(configDir, { plantumlServerUrl: 'https://plantuml.example.com' })
    const settings = readSettings(configDir)
    expect(settings.plantumlServerUrl).toBe('https://plantuml.example.com')
  })

  it('does not clobber token/port/roots when updating settings', () => {
    const before = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))
    updateSettings(configDir, { plantumlServerUrl: 'https://plantuml.example.com' })
    const after = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))
    expect(after.token).toBe(before.token)
    expect(after.port).toBe(before.port)
    expect(after.roots).toEqual(before.roots)
  })
})
