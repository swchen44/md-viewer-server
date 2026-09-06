import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfigDir, getStateDir } from '../xdg-paths.js'
import { loadOrCreateConfig } from '../config.js'
import { checkHealth, listCandidateIPs } from '../daemon-utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..')
const DEV_ENTRY_PATH = path.join(PROJECT_ROOT, 'src', 'server', 'entry.js')
const BUNDLE_PATH = path.join(PROJECT_ROOT, 'dist', 'bundle.js')

function resolveEntryPath() {
  // Prefer the source entry when this repo has one (development), so a
  // stale build never shadows the code actually being tested. A published
  // offline tarball ships dist/ without src/, so it falls back to the bundle.
  return fs.existsSync(DEV_ENTRY_PATH) ? DEV_ENTRY_PATH : BUNDLE_PATH
}

/**
 * Splits the requested roots into the ones we can actually serve and the ones
 * to warn about. Exported so callers that must decide *before* mutating any
 * state (notably the token-rotation flow) can reject an unserveable request
 * without first destroying a running daemon.
 */
export function validateRoots(roots) {
  const validRoots = []
  const skippedRoots = []
  for (const root of roots ?? []) {
    try {
      fs.accessSync(root, fs.constants.R_OK)
      validRoots.push(path.resolve(root))
    } catch {
      skippedRoots.push(root)
    }
  }
  return { validRoots, skippedRoots }
}

export async function runStart({ roots, port, debug = false }) {
  const { validRoots, skippedRoots } = validateRoots(roots)

  if (validRoots.length === 0) {
    return { outcome: 'no-valid-roots', skippedRoots }
  }

  const configDir = getConfigDir()
  const config = loadOrCreateConfig(configDir, { roots: validRoots, port })

  const existingHealth = await checkHealth(config.port)
  if (existingHealth) {
    return {
      outcome: 'already-running',
      port: config.port,
      token: config.token,
      uptime: existingHealth.uptime,
      roots: existingHealth.roots,
      ips: listCandidateIPs(),
      skippedRoots,
    }
  }

  const stateDir = getStateDir()
  fs.mkdirSync(stateDir, { recursive: true })

  const child = spawn(
    process.execPath,
    [resolveEntryPath(), ...(debug ? ['--debug'] : [])],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()

  const started = await waitForHealth(config.port)
  if (!started) {
    return { outcome: 'start-failed', port: config.port, skippedRoots }
  }

  return {
    outcome: 'started',
    port: config.port,
    token: config.token,
    ips: listCandidateIPs(),
    roots: validRoots,
    skippedRoots,
  }
}

async function waitForHealth(port, { retries = 20, intervalMs = 100 } = {}) {
  for (let i = 0; i < retries; i++) {
    const health = await checkHealth(port, { timeoutMs: 300 })
    if (health) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}
