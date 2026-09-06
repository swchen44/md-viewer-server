import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  InvalidSettingsError,
  readSettings,
  updateSettings,
} from '../../../src/server/settings.js'
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

  it('creates configDir if it does not exist yet (settings updated before start has ever run)', () => {
    const freshDir = path.join(configDir, 'not-created-yet')
    expect(fs.existsSync(freshDir)).toBe(false)
    expect(() =>
      updateSettings(freshDir, { plantumlServerUrl: 'https://plantuml.example.com' })
    ).not.toThrow()
    expect(readSettings(freshDir).plantumlServerUrl).toBe('https://plantuml.example.com')
  })

  describe('key whitelist', () => {
    it('rejects daemon lifecycle keys instead of merging them into config.json', () => {
      const before = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))

      expect(() => updateSettings(configDir, { token: '0000' })).toThrow(InvalidSettingsError)

      const after = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))
      expect(after.token).toBe(before.token)
    })

    it('reports every invalid key on the error', () => {
      try {
        updateSettings(configDir, { token: '0000', port: 1, roots: ['/etc'] })
        throw new Error('expected updateSettings to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidSettingsError)
        expect(err.code).toBe('INVALID_SETTINGS')
        expect(err.invalidKeys).toEqual(['token', 'port', 'roots'])
      }
    })

    it('rejects the whole update when a valid key is smuggled in alongside an invalid one', () => {
      expect(() =>
        updateSettings(configDir, {
          plantumlServerUrl: 'https://plantuml.example.com',
          roots: ['/etc'],
        })
      ).toThrow(InvalidSettingsError)
      const after = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf-8'))
      expect(after.roots).toEqual(['/tmp/a'])
      expect(after.plantumlServerUrl).toBeUndefined()
    })
  })
})
