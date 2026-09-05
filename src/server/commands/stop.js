import fs from 'node:fs'
import path from 'node:path'
import { getConfigDir, getStateDir } from '../xdg-paths.js'
import { readConfig } from '../config.js'
import { checkHealth } from '../daemon-utils.js'

export async function runStop() {
  const config = readConfig(getConfigDir())
  if (!config) {
    return { outcome: 'not-configured' }
  }

  const health = await checkHealth(config.port)
  if (!health) {
    return { outcome: 'not-running' }
  }

  const stateDir = getStateDir()
  const pidPath = path.join(stateDir, 'server.pid')

  let apiCallSucceeded = false
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/api/shutdown`, {
      method: 'POST',
      headers: { 'X-Auth-Token': config.token },
    })
    apiCallSucceeded = res.ok
  } catch {
    apiCallSucceeded = false
  }

  if (apiCallSucceeded) {
    await waitUntilStopped(config.port)
    cleanupPidFile(pidPath)
    return { outcome: 'stopped', via: 'api' }
  }

  if (fs.existsSync(pidPath)) {
    const pid = Number(fs.readFileSync(pidPath, 'utf8').trim())
    try {
      process.kill(pid, 'SIGTERM')
      await waitUntilStopped(config.port)
      cleanupPidFile(pidPath)
      return { outcome: 'stopped', via: 'signal' }
    } catch {
      return { outcome: 'stop-failed' }
    }
  }

  return { outcome: 'stop-failed' }
}

function cleanupPidFile(pidPath) {
  if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath)
}

async function waitUntilStopped(port, { retries = 30, intervalMs = 100 } = {}) {
  for (let i = 0; i < retries; i++) {
    const health = await checkHealth(port, { timeoutMs: 300 })
    if (!health) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}
