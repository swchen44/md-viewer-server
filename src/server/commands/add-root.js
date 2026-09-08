import { getConfigDir } from '../xdg-paths.js'
import { readConfig } from '../config.js'
import { checkHealth } from '../daemon-utils.js'

// A thin wrapper over POST /api/roots — same pattern as stop.js's runStop():
// read local config to find the running daemon, then just make the HTTP
// call. All the actual validation/persistence/watch-wiring logic lives
// server-side in src/server/api/roots.js; this file must not reimplement it.
export async function runAddRoot(rootPath, { configDir = getConfigDir() } = {}) {
  const config = readConfig(configDir)
  if (!config) {
    return { outcome: 'not-configured' }
  }

  const health = await checkHealth(config.port)
  if (!health) {
    return { outcome: 'not-running' }
  }

  let res
  try {
    res = await fetch(`http://127.0.0.1:${config.port}/api/roots`, {
      method: 'POST',
      headers: { 'X-Auth-Token': config.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: rootPath }),
    })
  } catch {
    return { outcome: 'not-running' }
  }

  if (res.status === 201) {
    const body = await res.json()
    return { outcome: 'added', rootId: body.id, name: body.name }
  }
  if (res.status === 400) {
    return { outcome: 'invalid-path' }
  }
  if (res.status === 409) {
    const body = await res.json()
    return { outcome: 'overlaps-existing', existingRootId: body.existingRootId }
  }

  return { outcome: 'request-failed', status: res.status }
}
