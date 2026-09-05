import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { checkHealth, listCandidateIPs } from '../../../src/server/daemon-utils.js'

describe('checkHealth', () => {
  let server

  afterEach(() => {
    if (server) server.close()
  })

  it('returns the health payload when the service responds correctly', async () => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({ service: 'md-viewer-server', version: '0.1.0', uptime: 5, roots: [] })
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port

    const result = await checkHealth(port)
    expect(result).toEqual({ service: 'md-viewer-server', version: '0.1.0', uptime: 5, roots: [] })
  })

  it('returns null when nothing is listening on the port', async () => {
    const result = await checkHealth(65534, { timeoutMs: 200 })
    expect(result).toBeNull()
  })

  it('returns null when a different service responds on the port', async () => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ service: 'some-other-app' }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port

    const result = await checkHealth(port)
    expect(result).toBeNull()
  })
})

describe('listCandidateIPs', () => {
  it('returns an array of IPv4 addresses', () => {
    const result = listCandidateIPs()
    expect(Array.isArray(result)).toBe(true)
    for (const ip of result) {
      expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
    }
  })
})
