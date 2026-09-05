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
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

export function loadOrCreateConfig(configDir, { roots, port }) {
  fs.mkdirSync(configDir, { recursive: true })
  const existing = readConfig(configDir)

  const config = {
    token: existing?.token ?? generateToken(),
    port: port ?? existing?.port ?? 4173,
    roots,
  }

  fs.writeFileSync(getConfigPath(configDir), JSON.stringify(config, null, 2))
  return config
}
