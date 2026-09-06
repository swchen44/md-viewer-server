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

  it('--rotate-token while running restarts the daemon so the new token takes effect immediately', async () => {
    const { stdout: startOut } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    const oldToken = extractToken(startOut)

    const oldTokenRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/roots`, {
      headers: { 'X-Auth-Token': oldToken },
    })
    expect(oldTokenRes.status).toBe(200)

    const { stdout: rotateOut } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT), '--rotate-token'],
      { env }
    )
    expect(rotateOut).toContain('Token rotated:')
    expect(rotateOut).toContain('daemon restarted to apply it.')
    const newToken = extractToken(rotateOut)
    expect(newToken).not.toBe(oldToken)

    const oldTokenAfterRotateRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/roots`, {
      headers: { 'X-Auth-Token': oldToken },
    })
    expect(oldTokenAfterRotateRes.status).toBe(401)

    const newTokenRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/roots`, {
      headers: { 'X-Auth-Token': newToken },
    })
    expect(newTokenRes.status).toBe(200)
  })

  it('--rotate-token with no valid root aborts without rotating or starting anything', async () => {
    // Establish a config with a known token, then stop, so the daemon is not
    // running for the simplest repro of the ordering bug.
    const { stdout: startOut } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    const originalToken = extractToken(startOut)
    await execFileAsync(process.execPath, [CLI_PATH, 'stop'], { env })

    const configPath = path.join(configHome, 'md-viewer-server', 'config.json')
    const before = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(before.token).toBe(originalToken)

    const missingRoot = path.join(testRoot, 'does-not-exist')
    const failure = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', missingRoot, '--port', String(TEST_PORT), '--rotate-token'],
      { env }
    ).catch((err) => err)

    expect(failure.code).toBe(1)
    expect(failure.stderr).toContain('No valid roots to serve. Aborting.')
    expect(failure.stdout).not.toContain('Token rotated')
    expect(failure.stdout).not.toContain('Started.')

    const after = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(after.token).toBe(originalToken)
    expect(after.roots).toEqual(before.roots)

    const { stdout: statusOut } = await execFileAsync(process.execPath, [CLI_PATH, 'status'], {
      env,
    })
    expect(statusOut).toContain('Not running')
  })

  it('--rotate-token with no valid root leaves an already-running daemon alive on its old token', async () => {
    const { stdout: startOut } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    const originalToken = extractToken(startOut)

    const missingRoot = path.join(testRoot, 'does-not-exist')
    const failure = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', missingRoot, '--port', String(TEST_PORT), '--rotate-token'],
      { env }
    ).catch((err) => err)

    expect(failure.code).toBe(1)
    expect(failure.stderr).toContain('No valid roots to serve. Aborting.')

    // The daemon is untouched and still accepts the token it was started with.
    const stillServing = await fetch(`http://127.0.0.1:${TEST_PORT}/api/roots`, {
      headers: { 'X-Auth-Token': originalToken },
    })
    expect(stillServing.status).toBe(200)

    const configPath = path.join(configHome, 'md-viewer-server', 'config.json')
    expect(JSON.parse(fs.readFileSync(configPath, 'utf-8')).token).toBe(originalToken)
  })

  it('a re-`start` preserves plantumlServerUrl written via the settings API', async () => {
    const { stdout: startOut } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    const token = extractToken(startOut)

    const putRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
      method: 'PUT',
      headers: { 'X-Auth-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plantumlServerUrl: 'http://plantuml.internal:8080' }),
    })
    expect(putRes.status).toBe(200)

    // A plain re-`start` (the "already running" no-op path) must not revert it.
    await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )

    const getRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/settings`, {
      headers: { 'X-Auth-Token': token },
    })
    expect((await getRes.json()).plantumlServerUrl).toBe('http://plantuml.internal:8080')
  })
})

function extractToken(cliOutput) {
  const match = cliOutput.match(/[?&]token=(\d+)/)
  if (!match) throw new Error(`Could not find a token in CLI output: ${cliOutput}`)
  return match[1]
}

describe('dist/bundle.js (built artifact)', () => {
  let configHome
  let stateHome
  let isolatedDir
  let isolatedBundlePath
  let child

  beforeEach(() => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-state-'))
    // Copy the bundle into an isolated tmp directory with no ancestor
    // package.json, so this genuinely simulates the documented offline
    // tarball deployment (bundle.js alone) rather than accidentally
    // passing because a package.json happens to be reachable from the
    // git checkout.
    isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvs-bundle-isolated-'))
    isolatedBundlePath = path.join(isolatedDir, 'bundle.js')
    fs.copyFileSync(BUNDLE_PATH, isolatedBundlePath)
  })

  afterEach(() => {
    if (child) child.kill('SIGTERM')
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    fs.rmSync(isolatedDir, { recursive: true, force: true })
  })

  it('serves /api/health when run directly (no src/ involved)', async () => {
    expect(fs.existsSync(BUNDLE_PATH)).toBe(true)

    const appConfigDir = path.join(configHome, 'md-viewer-server')
    fs.mkdirSync(appConfigDir, { recursive: true })
    fs.writeFileSync(
      path.join(appConfigDir, 'config.json'),
      JSON.stringify({ token: '1234', port: TEST_PORT + 1, roots: ['/tmp/project'] })
    )

    child = spawn(process.execPath, [isolatedBundlePath], {
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
