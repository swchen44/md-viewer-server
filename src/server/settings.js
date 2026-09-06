import fs from 'node:fs'
import { getConfigPath, readConfig } from './config.js'

const DEFAULT_PLANTUML_SERVER_URL = 'https://www.plantuml.com/plantuml'

// config.json holds two kinds of state: daemon lifecycle state (token, port,
// roots) that only the CLI owns, and user settings that the UI may change.
// Only the keys listed here are settings; everything else is rejected so the
// settings endpoint can never rewrite the daemon's own identity.
const ALLOWED_SETTINGS_KEYS = [
  'plantumlServerUrl',
  'sendToPlantUmlServer',
  'privacyMode',
  'blockRemoteContent',
  'allowHtmlScripts',
  'bakOnSave',
  'customCssChoice',
  'customCssUser1',
  'customCssUser2',
]

export class InvalidSettingsError extends Error {
  constructor(message, { invalidKeys = [] } = {}) {
    super(message)
    this.name = 'InvalidSettingsError'
    this.code = 'INVALID_SETTINGS'
    this.invalidKeys = invalidKeys
  }
}

function assertValidPlantUmlServerUrl(value) {
  if (typeof value !== 'string') {
    throw new InvalidSettingsError('plantumlServerUrl must be a string', {
      invalidKeys: ['plantumlServerUrl'],
    })
  }
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new InvalidSettingsError(`plantumlServerUrl is not a valid URL: ${value}`, {
      invalidKeys: ['plantumlServerUrl'],
    })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidSettingsError(
      `plantumlServerUrl must use http: or https: (got ${parsed.protocol})`,
      { invalidKeys: ['plantumlServerUrl'] }
    )
  }
}

export function readSettings(configDir) {
  const config = readConfig(configDir) ?? {}
  const privacyMode = config.privacyMode ?? false
  const blockRemoteContent = config.blockRemoteContent ?? false
  const sendToPlantUmlServer = config.sendToPlantUmlServer ?? false
  const allowHtmlScripts = config.allowHtmlScripts ?? false

  return {
    plantumlServerUrl: config.plantumlServerUrl ?? DEFAULT_PLANTUML_SERVER_URL,
    sendToPlantUmlServer,
    privacyMode,
    blockRemoteContent,
    allowHtmlScripts,
    bakOnSave: config.bakOnSave ?? false,
    customCssChoice: config.customCssChoice ?? 'user1',
    customCssUser1: config.customCssUser1 ?? '',
    customCssUser2: config.customCssUser2 ?? '',
    // Privacy mode locks these three to safe values for any code path that
    // makes a security-relevant decision. Stored preferences above are left
    // untouched so disabling privacy mode restores what the user had.
    effective: {
      blockRemoteContent: privacyMode ? true : blockRemoteContent,
      sendToPlantUmlServer: privacyMode ? false : sendToPlantUmlServer,
      allowHtmlScripts: privacyMode ? false : allowHtmlScripts,
    },
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

  if ('plantumlServerUrl' in updates) {
    // The proxy fetches this URL and hands the body back to the browser, so an
    // unvalidated value is an SSRF read primitive against anything the daemon
    // host can reach.
    assertValidPlantUmlServerUrl(updates.plantumlServerUrl)
  }

  const config = readConfig(configDir) ?? {}
  const merged = { ...config, ...updates }
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(merged, null, 2))
  return readSettings(configDir)
}
