import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../src/server/app.js'

function buildTestApp(overrides = {}) {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const onShutdown = vi.fn()
  const app = createApp({
    config: { token: '1234', roots: ['/tmp/a'] },
    logger,
    getUptimeSeconds: () => 42,
    packageVersion: '0.1.0',
    onShutdown,
    ...overrides,
  })
  return { app, logger, onShutdown }
}

describe('GET /api/health', () => {
  it('returns service info without requiring auth', async () => {
    const { app } = buildTestApp()
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      service: 'md-viewer-server',
      version: '0.1.0',
      uptime: 42,
      roots: ['/tmp/a'],
    })
  })
})

describe('POST /api/shutdown', () => {
  it('rejects requests without a valid token', async () => {
    const { app, onShutdown } = buildTestApp()
    const res = await request(app).post('/api/shutdown').set('X-Auth-Token', 'wrong')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ errorCode: 'UNAUTHORIZED' })
    expect(onShutdown).not.toHaveBeenCalled()
  })

  it('triggers onShutdown when the token matches', async () => {
    const { app, onShutdown } = buildTestApp()
    const res = await request(app).post('/api/shutdown').set('X-Auth-Token', '1234')
    expect(res.status).toBe(200)
    expect(onShutdown).toHaveBeenCalledOnce()
  })
})
