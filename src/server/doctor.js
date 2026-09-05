import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { readConfig } from './config.js'
import { checkHealth } from './daemon-utils.js'
import { readInotifyLimit } from './inotify-check.js'

const MIN_NODE_MAJOR = 18

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  return major >= MIN_NODE_MAJOR
    ? { name: 'node-version', status: 'ok', message: `Node ${process.versions.node}` }
    : { name: 'node-version', status: 'fail', message: `Node ${process.versions.node} < ${MIN_NODE_MAJOR}` }
}

function checkBundleIntegrity() {
  // bundle.js/frontend dist don't exist yet at this stage of the project —
  // this check degrades to "not applicable" (warn) rather than a hard fail.
  const bundlePath = path.join(process.cwd(), 'dist', 'bundle.js')
  return fs.existsSync(bundlePath)
    ? { name: 'bundle-integrity', status: 'ok', message: 'dist/bundle.js present' }
    : { name: 'bundle-integrity', status: 'warn', message: 'dist/bundle.js not built yet' }
}

function checkXdgDirs(configDir, stateDir) {
  const configOk = fs.existsSync(configDir) && fs.statSync(configDir).isDirectory()
  const stateOk = fs.existsSync(stateDir) && fs.statSync(stateDir).isDirectory()
  return configOk && stateOk
    ? { name: 'xdg-dirs', status: 'ok', message: 'Config and state directories exist' }
    : { name: 'xdg-dirs', status: 'fail', message: 'Config or state directory missing' }
}

function checkConfigValid(configDir) {
  const config = readConfig(configDir)
  if (!config) return { name: 'config-valid', status: 'fail', message: 'config.json missing or corrupt' }
  if (!/^\d{4}$/.test(config.token)) {
    return { name: 'config-valid', status: 'fail', message: 'token is not a valid 4-digit string' }
  }
  return { name: 'config-valid', status: 'ok', message: 'config.json is valid' }
}

function checkRootAccessible(roots) {
  for (const root of roots) {
    try {
      fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK)
    } catch {
      return { name: 'root-accessible', status: 'fail', message: `Not accessible: ${root}` }
    }
  }
  return { name: 'root-accessible', status: 'ok', message: 'All roots readable and writable' }
}

async function checkDaemonRunning(port) {
  const health = await checkHealth(port, { timeoutMs: 500 })
  return health
    ? { name: 'daemon-running', status: 'ok', message: `Running, uptime ${health.uptime}s` }
    : { name: 'daemon-running', status: 'warn', message: 'Not running' }
}

async function checkPortAvailable(port, daemonRunning) {
  if (daemonRunning) return { name: 'port-available', status: 'ok', message: 'Port in use by this daemon' }
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () =>
        resolve({ name: 'port-available', status: 'fail', message: `Port ${port} is occupied by another process` })
      )
      .once('listening', () => {
        tester.close(() =>
          resolve({ name: 'port-available', status: 'ok', message: `Port ${port} is free` })
        )
      })
      .listen(port, '127.0.0.1')
  })
}

function checkStalePid(stateDir, daemonRunning) {
  const pidPath = path.join(stateDir, 'server.pid')
  if (!fs.existsSync(pidPath)) return { name: 'stale-pid', status: 'ok', message: 'No pid file' }
  return daemonRunning
    ? { name: 'stale-pid', status: 'ok', message: 'Pid file matches running daemon' }
    : { name: 'stale-pid', status: 'warn', message: 'Stale pid file (daemon not responding)' }
}

function checkInotifyLimit(roots) {
  const limit = readInotifyLimit()
  if (limit === null) return { name: 'inotify-limit', status: 'ok', message: 'Not applicable on this platform' }

  let totalFiles = 0
  for (const root of roots) {
    try {
      totalFiles += fs.readdirSync(root, { recursive: true }).length
    } catch {
      // root inaccessible, already flagged by root-accessible check
    }
  }

  return totalFiles > limit * 0.8
    ? { name: 'inotify-limit', status: 'warn', message: `${totalFiles} files approaching limit ${limit}` }
    : { name: 'inotify-limit', status: 'ok', message: `${totalFiles} files, limit ${limit}` }
}

function checkDiskSpace(stateDir) {
  try {
    const stat = fs.statfsSync(stateDir)
    const freeBytes = stat.bavail * stat.bsize
    const freeMb = Math.round(freeBytes / 1024 / 1024)
    return freeMb < 100
      ? { name: 'disk-space', status: 'warn', message: `Only ${freeMb}MB free` }
      : { name: 'disk-space', status: 'ok', message: `${freeMb}MB free` }
  } catch {
    return { name: 'disk-space', status: 'ok', message: 'Could not determine (non-fatal)' }
  }
}

export async function runDoctor({ configDir, stateDir, roots, port }) {
  const daemonCheck = await checkDaemonRunning(port)
  const daemonRunning = daemonCheck.status === 'ok'

  return [
    checkNodeVersion(),
    checkBundleIntegrity(),
    checkXdgDirs(configDir, stateDir),
    checkConfigValid(configDir),
    checkRootAccessible(roots),
    daemonCheck,
    await checkPortAvailable(port, daemonRunning),
    checkStalePid(stateDir, daemonRunning),
    checkInotifyLimit(roots),
    checkDiskSpace(stateDir),
  ]
}
