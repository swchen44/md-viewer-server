import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..', '..')
const CLI_PATH = path.join(PROJECT_ROOT, 'bin', 'cli.js')
const BUNDLE_PATH = path.join(PROJECT_ROOT, 'dist', 'bundle.js')

// Spread test ports across a range keyed on pid so parallel CI runs don't collide.
const TEST_PORT = 20000 + (process.pid % 10000)

describe('CLI lifecycle: start -> status -> stop', () => {
  let configHome
  let stateHome
  let testRoot
  let env

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-state-'))
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-root-'))
    env = {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      XDG_STATE_HOME: stateHome,
    }
  })

  afterEach(async () => {
    try {
      await execFileAsync(process.execPath, [CLI_PATH, 'stop'], { env })
    } catch {
      // already stopped, ignore
    }
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it('starts, reports running status, then stops cleanly', async () => {
    const { stdout: startOut } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    expect(startOut).toContain('Started.')

    const { stdout: statusOut } = await execFileAsync(process.execPath, [CLI_PATH, 'status'], {
      env,
    })
    expect(statusOut).toContain('Running on port')

    const { stdout: stopOut } = await execFileAsync(process.execPath, [CLI_PATH, 'stop'], { env })
    expect(stopOut).toContain('Stopped')

    const { stdout: statusAfterStop } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'status'],
      { env }
    )
    expect(statusAfterStop).toContain('Not running')
  })

  it('running start twice does not spawn a second process', async () => {
    await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    const { stdout } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    expect(stdout).toContain('Already running')
  })
})

describe('dist/bundle.js (built artifact)', () => {
  let configHome
  let stateHome
  let child

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-state-'))
  })

  afterEach(() => {
    if (child) child.kill('SIGTERM')
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
  })

  it('serves /api/health when run directly (no src/ involved)', async () => {
    expect(fs.existsSync(BUNDLE_PATH)).toBe(true)

    const appConfigDir = path.join(configHome, 'md-viewer-server')
    fs.mkdirSync(appConfigDir, { recursive: true })
    fs.writeFileSync(
      path.join(appConfigDir, 'config.json'),
      JSON.stringify({ token: '1234', port: TEST_PORT + 1, roots: ['/tmp/project'] })
    )

    child = spawn(process.execPath, [BUNDLE_PATH], {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
        XDG_STATE_HOME: stateHome,
      },
      stdio: 'ignore',
    })

    const health = await waitForHealth(TEST_PORT + 1)
    expect(health.service).toBe('md-viewer-server')
    expect(health.roots).toEqual(['/tmp/project'])
    expect(health.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

async function waitForHealth(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return res.json()
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Server on port ${port} never became healthy`)
}
