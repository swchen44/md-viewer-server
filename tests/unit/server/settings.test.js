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

  it('defaults sendToPlantUmlServer to false and persists it when set', () => {
    expect(readSettings(configDir).sendToPlantUmlServer).toBe(false)
    updateSettings(configDir, { sendToPlantUmlServer: true })
    expect(readSettings(configDir).sendToPlantUmlServer).toBe(true)
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

  describe('privacy mode effective overrides', () => {
    it('effective values equal stored values when privacyMode is false', () => {
      updateSettings(configDir, {
        blockRemoteContent: false,
        sendToPlantUmlServer: true,
        allowHtmlScripts: true,
      })
      const settings = readSettings(configDir)
      expect(settings.effective).toEqual({
        blockRemoteContent: false,
        sendToPlantUmlServer: true,
        allowHtmlScripts: true,
      })
    })

    it('forces safe effective values when privacyMode is true, regardless of stored preferences', () => {
      updateSettings(configDir, {
        privacyMode: true,
        blockRemoteContent: false,
        sendToPlantUmlServer: true,
        allowHtmlScripts: true,
      })
      const settings = readSettings(configDir)
      expect(settings.effective).toEqual({
        blockRemoteContent: true,
        sendToPlantUmlServer: false,
        allowHtmlScripts: false,
      })
      // stored preferences are preserved, not overwritten, so turning privacy mode
      // back off restores what the user had before
      expect(settings.blockRemoteContent).toBe(false)
      expect(settings.sendToPlantUmlServer).toBe(true)
      expect(settings.allowHtmlScripts).toBe(true)
    })

    it('defaults privacyMode, blockRemoteContent, allowHtmlScripts, bakOnSave to false', () => {
      const settings = readSettings(configDir)
      expect(settings.privacyMode).toBe(false)
      expect(settings.blockRemoteContent).toBe(false)
      expect(settings.allowHtmlScripts).toBe(false)
      expect(settings.bakOnSave).toBe(false)
    })

    it('accepts the new keys through updateSettings', () => {
      expect(() =>
        updateSettings(configDir, {
          privacyMode: true,
          blockRemoteContent: true,
          allowHtmlScripts: false,
          bakOnSave: true,
        })
      ).not.toThrow()
    })
  })

  describe('custom CSS choice', () => {
    it('defaults CSS choice to user1 with empty slots', () => {
      const settings = readSettings(configDir)
      expect(settings.customCssChoice).toBe('user1')
      expect(settings.customCssUser1).toBe('')
      expect(settings.customCssUser2).toBe('')
    })

    it('accepts CSS choice fields through updateSettings', () => {
      updateSettings(configDir, {
        customCssChoice: 'user2',
        customCssUser1: '.markdown-body { color: blue; }',
        customCssUser2: '.markdown-body { color: green; }',
      })
      const settings = readSettings(configDir)
      expect(settings.customCssChoice).toBe('user2')
      expect(settings.customCssUser1).toBe('.markdown-body { color: blue; }')
      expect(settings.customCssUser2).toBe('.markdown-body { color: green; }')
    })
  })

  describe('field type validation', () => {
    describe.each([
      'privacyMode',
      'blockRemoteContent',
      'sendToPlantUmlServer',
      'allowHtmlScripts',
      'bakOnSave',
    ])('%s (boolean)', (key) => {
      it('rejects a non-boolean value and leaves the stored value unchanged', () => {
        const before = readSettings(configDir)[key]
        expect(() => updateSettings(configDir, { [key]: 'not-a-boolean' })).toThrow(
          InvalidSettingsError
        )
        expect(readSettings(configDir)[key]).toBe(before)
      })

      it('accepts a valid boolean value', () => {
        const before = readSettings(configDir)[key]
        expect(() => updateSettings(configDir, { [key]: !before })).not.toThrow()
        expect(readSettings(configDir)[key]).toBe(!before)
      })
    })

    describe.each(['customCssUser1', 'customCssUser2'])('%s (string)', (key) => {
      it('rejects a non-string value and leaves the stored value unchanged', () => {
        const before = readSettings(configDir)[key]
        expect(() => updateSettings(configDir, { [key]: {} })).toThrow(InvalidSettingsError)
        expect(readSettings(configDir)[key]).toBe(before)
      })

      it('accepts a valid string value', () => {
        expect(() =>
          updateSettings(configDir, { [key]: '.markdown-body { color: pink; }' })
        ).not.toThrow()
        expect(readSettings(configDir)[key]).toBe('.markdown-body { color: pink; }')
      })
    })

    describe('customCssChoice (enum)', () => {
      it('rejects a value outside the four allowed choices and leaves the stored value unchanged', () => {
        const before = readSettings(configDir).customCssChoice
        expect(() => updateSettings(configDir, { customCssChoice: 'bogus' })).toThrow(
          InvalidSettingsError
        )
        expect(readSettings(configDir).customCssChoice).toBe(before)
      })

      it('accepts each of the four allowed choices', () => {
        for (const choice of ['editorial', 'developer', 'user1', 'user2']) {
          expect(() => updateSettings(configDir, { customCssChoice: choice })).not.toThrow()
          expect(readSettings(configDir).customCssChoice).toBe(choice)
        }
      })
    })
  })

  describe('plantumlServerUrl validation', () => {
    it('rejects a string that is not a URL at all', () => {
      expect(() => updateSettings(configDir, { plantumlServerUrl: 'not a url' })).toThrow(
        InvalidSettingsError
      )
      expect(readSettings(configDir).plantumlServerUrl).toBe('https://www.plantuml.com/plantuml')
    })

    it('rejects a file: URL', () => {
      expect(() => updateSettings(configDir, { plantumlServerUrl: 'file:///etc/passwd' })).toThrow(
        InvalidSettingsError
      )
    })

    it('rejects a javascript: URL', () => {
      expect(() =>
        updateSettings(configDir, { plantumlServerUrl: 'javascript:alert(1)' })
      ).toThrow(InvalidSettingsError)
    })

    it('rejects a non-string value', () => {
      expect(() => updateSettings(configDir, { plantumlServerUrl: 42 })).toThrow(
        InvalidSettingsError
      )
    })

    it('accepts http: and https: URLs', () => {
      expect(() =>
        updateSettings(configDir, { plantumlServerUrl: 'http://plantuml.internal:8080' })
      ).not.toThrow()
      expect(() =>
        updateSettings(configDir, { plantumlServerUrl: 'https://plantuml.example.com' })
      ).not.toThrow()
    })
  })
})
