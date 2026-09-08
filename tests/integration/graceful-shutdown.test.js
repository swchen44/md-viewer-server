import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..', '..')
const CLI_PATH = path.join(PROJECT_ROOT, 'bin', 'cli.js')

// Spread test ports across a range keyed on pid so parallel CI runs don't collide.
const TEST_PORT = 24000 + (process.pid % 5000)

// Real, whole-process shutdown check: unlike checkHealth (which only tells
// you the port has stopped accepting NEW connections, which happens
// immediately regardless of this bug), this confirms the OS process
// actually exited.
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForProcessExit(pid, { timeoutMs = 4000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return !isProcessAlive(pid)
}

function extractToken(cliOutput) {
  const match = cliOutput.match(/[?&]token=(\d+)/)
  if (!match) throw new Error(`Could not find a token in CLI output: ${cliOutput}`)
  return match[1]
}

describe('graceful shutdown with a lingering raw socket', () => {
  let configHome
  let stateHome
  let testRoot
  let env
  let daemonPid
  let danglingSocket

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'shutdown-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'shutdown-state-'))
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'shutdown-root-'))
    env = {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      XDG_STATE_HOME: stateHome,
    }
    daemonPid = null
    danglingSocket = null
  })

  afterEach(async () => {
    if (danglingSocket) {
      danglingSocket.destroy()
    }
    if (daemonPid && isProcessAlive(daemonPid)) {
      // Clean up anything the fix under test failed to reap, so this
      // investigation doesn't leave zombie daemons running on the machine.
      try {
        process.kill(daemonPid, 'SIGKILL')
      } catch {
        // already gone
      }
    }
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it(
    'exits the daemon process promptly even when a raw socket never closes itself',
    async () => {
      const { stdout: startOut } = await execFileAsync(
        process.execPath,
        [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
        { env }
      )
      expect(startOut).toContain('Started.')
      const token = extractToken(startOut)

      const pidPath = path.join(stateHome, 'md-viewer-server', 'server.pid')
      daemonPid = Number(fs.readFileSync(pidPath, 'utf8').trim())
      expect(isProcessAlive(daemonPid)).toBe(true)

      // Simulate the reconnecting-WS-client race: a raw TCP socket that
      // connects but never sends a valid HTTP/WS-upgrade request and never
      // closes itself, exactly the shape of connection that would leave
      // http.Server.close()'s callback waiting forever pre-fix.
      danglingSocket = await new Promise((resolve, reject) => {
        const socket = net.connect(TEST_PORT, '127.0.0.1', () => resolve(socket))
        socket.on('error', reject)
      })

      // Trigger the real shutdown path (same one the `stop` CLI command
      // uses), without going through `stop`'s health-check-based
      // waitUntilStopped, since that only checks whether the port refuses
      // NEW connections and would misreport success even with the bug.
      const shutdownRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/shutdown`, {
        method: 'POST',
        headers: { 'X-Auth-Token': token },
      })
      expect(shutdownRes.ok).toBe(true)

      const exited = await waitForProcessExit(daemonPid, { timeoutMs: 4000 })
      expect(exited).toBe(true)
    },
    // Bounded well above the internal 4000ms poll deadline so a genuine hang
    // fails this test instead of stalling the whole vitest run.
    { timeout: 8000 }
  )
})
