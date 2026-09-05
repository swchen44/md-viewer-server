import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSettingsRouter } from '../../src/server/api/settings.js'
import { createPlantUmlRouter } from '../../src/server/api/plantuml.js'
import { loadOrCreateConfig } from '../../src/server/config.js'

describe('settings and PlantUML proxy API', () => {
  let configDir
  let fakeUpstream
  let fakeUpstreamPort

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-plantuml-'))
    loadOrCreateConfig(configDir, { roots: ['/tmp/a'], port: 4173 })

    fakeUpstream = http.createServer((req, res) => {
      if (req.url.includes('/png/')) {
        res.setHeader('Content-Type', 'image/png')
        res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      } else {
        res.statusCode = 404
        res.end()
      }
    })
    await new Promise((resolve) => fakeUpstream.listen(0, '127.0.0.1', resolve))
    fakeUpstreamPort = fakeUpstream.address().port
  })

  afterEach(async () => {
    await new Promise((resolve) => fakeUpstream.close(resolve))
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  function buildApp() {
    const app = express()
    app.use(express.json())
    app.use('/api', createSettingsRouter(configDir))
    app.use('/api', createPlantUmlRouter(configDir))
    return app
  }

  it('GET /api/settings returns the default PlantUML server URL', async () => {
    const res = await request(buildApp()).get('/api/settings')
    expect(res.status).toBe(200)
    expect(res.body.plantumlServerUrl).toBe('https://www.plantuml.com/plantuml')
  })

  it('PUT /api/settings updates and persists the PlantUML server URL', async () => {
    const app = buildApp()
    const putRes = await request(app)
      .put('/api/settings')
      .send({ plantumlServerUrl: `http://127.0.0.1:${fakeUpstreamPort}` })
    expect(putRes.status).toBe(200)
    expect(putRes.body.plantumlServerUrl).toBe(`http://127.0.0.1:${fakeUpstreamPort}`)

    const getRes = await request(app).get('/api/settings')
    expect(getRes.body.plantumlServerUrl).toBe(`http://127.0.0.1:${fakeUpstreamPort}`)
  })

  it('POST /api/plantuml-proxy encodes the source and proxies to the configured server', async () => {
    const app = buildApp()
    await request(app)
      .put('/api/settings')
      .send({ plantumlServerUrl: `http://127.0.0.1:${fakeUpstreamPort}` })

    const res = await request(app)
      .post('/api/plantuml-proxy')
      .send({ source: '@startuml\nAlice -> Bob\n@enduml' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
  })

  it('returns 502 when the upstream PlantUML server is unreachable', async () => {
    const app = buildApp()
    await request(app).put('/api/settings').send({ plantumlServerUrl: 'http://127.0.0.1:1' })

    const res = await request(app)
      .post('/api/plantuml-proxy')
      .send({ source: '@startuml\nA -> B\n@enduml' })

    expect(res.status).toBe(502)
    expect(res.body.errorCode).toBe('PLANTUML_UNREACHABLE')
  })

  it('returns 400 when source is missing from the request body', async () => {
    const res = await request(buildApp()).post('/api/plantuml-proxy').send({})
    expect(res.status).toBe(400)
  })
})
