import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.join(__dirname, '..', '..')
const CLI_PATH = path.join(PROJECT_ROOT, 'bin', 'cli.js')
const FRONTEND_INDEX = path.join(PROJECT_ROOT, 'dist', 'frontend', 'index.html')
const TEST_PORT = 23000 + (process.pid % 10000)

describe('frontend static serving', () => {
  let configHome, stateHome, testRoot, env

  beforeAll(() => {
    // `bin/cli.js` spawns `src/server/entry.js` straight from source whenever
    // this checkout has one (see resolveEntryPath() in
    // src/server/commands/start.js), which it always does here, so this test
    // never touches dist/bundle.js. It does need dist/frontend/, though,
    // which only `vite build` (via `npm run build`) produces — nothing in
    // `npm run test:integration` builds it automatically. This matches the
    // existing convention in cli-lifecycle.test.js's "dist/bundle.js (built
    // artifact)" suite, which likewise assumes a prior `npm run build`
    // instead of building for itself.
    if (!fs.existsSync(FRONTEND_INDEX)) {
      throw new Error(
        `${FRONTEND_INDEX} not found. Run \`npm run build\` (or \`npm run build:frontend\`) before running the integration suite.`
      )
    }
  })

  beforeEach(async () => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-serve-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-serve-state-'))
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-serve-root-'))
    env = { ...process.env, XDG_CONFIG_HOME: configHome, XDG_STATE_HOME: stateHome }
    await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
  })

  afterEach(async () => {
    await execFileAsync(process.execPath, [CLI_PATH, 'stop'], { env }).catch(() => {})
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  it('serves the frontend index.html for a non-API path', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<div id="root">')
  })

  it('serves the SPA fallback for a client-side route', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/some/client/route`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<div id="root">')
  })

  it('serves a built JS asset with a JavaScript content type', async () => {
    const html = await (await fetch(`http://127.0.0.1:${TEST_PORT}/`)).text()
    const match = html.match(/src="(\/assets\/[^"]+\.js)"/)
    expect(match).not.toBeNull()
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}${match[1]}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('javascript')
  })

  it('does not let the SPA fallback shadow API routes', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`)
    const body = await res.json()
    expect(body.service).toBe('md-viewer-server')
  })

  it('does not require an auth token to load the frontend shell', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/`)
    expect(res.status).toBe(200)
  })
})
