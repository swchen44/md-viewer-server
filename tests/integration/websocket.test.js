import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import WebSocket from 'ws'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWsServer } from '../../src/server/ws-server.js'

describe('WebSocket server', () => {
  let rootDir
  let httpServer
  let wsServer
  let port

  beforeEach(async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'))
    httpServer = http.createServer((req, res) => res.end('ok'))
    wsServer = createWsServer(httpServer, { token: '1234', roots: [{ id: 0, path: rootDir }] })
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    port = httpServer.address().port
  })

  afterEach(async () => {
    await wsServer.close()
    await new Promise((resolve) => httpServer.close(resolve))
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  it('accepts a connection with a valid token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=1234`)
    await new Promise((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('rejects a connection with an invalid token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=wrong`)
    const closeCode = await new Promise((resolve) => {
      ws.on('close', (code) => resolve(code))
      ws.on('error', () => {}) // expected
    })
    expect(closeCode).toBe(4001)
  })

  it('broadcasts a file-changed event to connected clients', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=1234`)
    await new Promise((resolve) => ws.on('open', resolve))

    const messagePromise = new Promise((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'file-changed') {
          resolve(msg)
        }
      })
    })

    fs.writeFileSync(path.join(rootDir, 'a.md'), 'v1')
    await new Promise((resolve) => setTimeout(resolve, 300))
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'v2')

    const message = await messagePromise
    expect(message).toEqual(
      expect.objectContaining({ type: 'file-changed', rootId: 0, relPath: 'a.md' })
    )
    ws.close()
  })

  it('close() resolves promptly even if a client is still connected', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=1234`)
    await new Promise((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    ws.on('error', () => {}) // the server terminates the socket during close()

    // Deliberately do NOT close the client here. Prior to the fix, wss.close()
    // would hang forever waiting for this client to disconnect on its own.
    const closePromise = wsServer.close()
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('close() timed out')), 2000)
    )

    await expect(Promise.race([closePromise, timeoutPromise])).resolves.toBeUndefined()

    // afterEach will call wsServer.close() again; that should be a no-op/safe.
  })
})
