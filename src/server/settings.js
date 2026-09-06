import fs from 'node:fs'
import { getConfigPath, readConfig } from './config.js'

const DEFAULT_PLANTUML_SERVER_URL = 'https://www.plantuml.com/plantuml'

// config.json holds two kinds of state: daemon lifecycle state (token, port,
// roots) that only the CLI owns, and user settings that the UI may change.
// Only the keys listed here are settings; everything else is rejected so the
// settings endpoint can never rewrite the daemon's own identity.
const ALLOWED_SETTINGS_KEYS = ['plantumlServerUrl']

export class InvalidSettingsError extends Error {
  constructor(message, { invalidKeys = [] } = {}) {
    super(message)
    this.name = 'InvalidSettingsError'
    this.code = 'INVALID_SETTINGS'
    this.invalidKeys = invalidKeys
  }
}

export function readSettings(configDir) {
  const config = readConfig(configDir) ?? {}
  return {
    plantumlServerUrl: config.plantumlServerUrl ?? DEFAULT_PLANTUML_SERVER_URL,
  }
}

export function updateSettings(configDir, updates) {
  const invalidKeys = Object.keys(updates ?? {}).filter(
    (key) => !ALLOWED_SETTINGS_KEYS.includes(key)
  )
  if (invalidKeys.length > 0) {
    throw new InvalidSettingsError(`Invalid settings keys: ${invalidKeys.join(', ')}`, {
      invalidKeys,
    })
  }

  const config = readConfig(configDir) ?? {}
  const merged = { ...config, ...updates }
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(merged, null, 2))
  return readSettings(configDir)
}
