import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function generateToken() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0')
}

export function getConfigPath(configDir) {
  return path.join(configDir, 'config.json')
}

export function readConfig(configDir) {
  const configPath = getConfigPath(configDir)
  if (!fs.existsSync(configPath)) return null
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return null
  }
}

export function loadOrCreateConfig(configDir, { roots, port }) {
  fs.mkdirSync(configDir, { recursive: true })
  const existing = readConfig(configDir)

  // Spread `existing` first so keys this function doesn't know about —
  // settings written via updateSettings (e.g. plantumlServerUrl) — survive
  // every `start`. Without this, starting the daemon silently reverts the
  // user's PlantUML server back to the public default, which is a privacy
  // regression: PlantUML rendering is the one path that sends document
  // content to a third party.
  const config = {
    ...existing,
    token: existing?.token ?? generateToken(),
    port: port ?? existing?.port ?? 4173,
    roots,
  }

  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(config, null, 2))
  return config
}

export function rotateToken(configDir) {
  const existing = readConfig(configDir)
  if (!existing) {
    throw new Error('No config.json found; nothing to rotate. Run `start` first.')
  }
  const updated = { ...existing, token: generateToken() }
  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(updated, null, 2))
  return updated
}
