import fs from 'node:fs'
import { getConfigPath, readConfig } from './config.js'

const DEFAULT_PLANTUML_SERVER_URL = 'https://www.plantuml.com/plantuml'

export function readSettings(configDir) {
  const config = readConfig(configDir) ?? {}
  return {
    plantumlServerUrl: config.plantumlServerUrl ?? DEFAULT_PLANTUML_SERVER_URL,
  }
}

export function updateSettings(configDir, updates) {
  const config = readConfig(configDir) ?? {}
  const merged = { ...config, ...updates }
  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(merged, null, 2))
  return readSettings(configDir)
}
