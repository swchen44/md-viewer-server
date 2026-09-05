import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.join(__dirname, '..', '..', 'bin', 'cli.js')
const TEST_PORT = 21000 + (process.pid % 10000)

describe('file API end-to-end', () => {
  let configHome, stateHome, testRoot, env, token

  beforeEach(async () => {
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-config-'))
    stateHome = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-state-'))
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-root-'))
    fs.writeFileSync(path.join(testRoot, 'a.md'), '# Hello')
    env = { ...process.env, XDG_CONFIG_HOME: configHome, XDG_STATE_HOME: stateHome }

    const { stdout } = await execFileAsync(
      process.execPath,
      [CLI_PATH, 'start', '--root', testRoot, '--port', String(TEST_PORT)],
      { env }
    )
    token = stdout.match(/token=(\d{4})/)[1]
  })

  afterEach(async () => {
    await execFileAsync(process.execPath, [CLI_PATH, 'stop'], { env }).catch(() => {})
    fs.rmSync(configHome, { recursive: true, force: true })
    fs.rmSync(stateHome, { recursive: true, force: true })
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  function apiUrl(pathAndQuery) {
    return `http://127.0.0.1:${TEST_PORT}${pathAndQuery}`
  }

  it('rejects requests without a valid token', async () => {
    const res = await fetch(apiUrl('/api/roots'))
    expect(res.status).toBe(401)
  })

  it('lists roots and files with a valid token', async () => {
    const rootsRes = await fetch(apiUrl('/api/roots'), { headers: { 'X-Auth-Token': token } })
    expect((await rootsRes.json())).toEqual([{ id: 0, name: path.basename(testRoot) }])

    const filesRes = await fetch(apiUrl('/api/files?root=0'), {
      headers: { 'X-Auth-Token': token },
    })
    const { files } = await filesRes.json()
    expect(files).toEqual([expect.objectContaining({ relPath: 'a.md' })])
  })

  it('reads, writes, and detects a conflict on a file', async () => {
    const headers = { 'X-Auth-Token': token, 'Content-Type': 'application/json' }

    const getRes = await fetch(apiUrl('/api/file?root=0&path=a.md'), { headers })
    const { mtimeMs } = await getRes.json()

    const putRes = await fetch(apiUrl('/api/file?root=0&path=a.md'), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: '# Updated', mtimeMs }),
    })
    expect(putRes.status).toBe(200)

    // stale mtime from before the update above -> conflict
    const conflictRes = await fetch(apiUrl('/api/file?root=0&path=a.md'), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content: '# Stale write', mtimeMs }),
    })
    expect(conflictRes.status).toBe(409)
  })

  it('rejects a path traversal attempt', async () => {
    const res = await fetch(apiUrl('/api/file?root=0&path=../../../etc/passwd'), {
      headers: { 'X-Auth-Token': token },
    })
    expect(res.status).toBe(400)
  })
})
