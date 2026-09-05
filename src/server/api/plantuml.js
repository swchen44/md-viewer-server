import express from 'express'
import { readSettings } from '../settings.js'
import { encodePlantUmlText } from '../plantuml-encode.js'

export function createPlantUmlRouter(configDir) {
  const router = express.Router()

  router.post('/plantuml-proxy', async (req, res) => {
    const { source } = req.body
    if (!source || typeof source !== 'string') {
      return res.status(400).json({ errorCode: 'MISSING_SOURCE' })
    }

    const { plantumlServerUrl } = readSettings(configDir)
    const encoded = encodePlantUmlText(source)
    const upstreamUrl = `${plantumlServerUrl}/png/${encoded}`

    try {
      const upstreamRes = await fetch(upstreamUrl, { signal: AbortSignal.timeout(10_000) })
      if (!upstreamRes.ok) {
        return res.status(502).json({ errorCode: 'PLANTUML_UNREACHABLE' })
      }
      const buffer = Buffer.from(await upstreamRes.arrayBuffer())
      res.set('Content-Type', upstreamRes.headers.get('content-type') ?? 'image/png')
      res.send(buffer)
    } catch {
      res.status(502).json({ errorCode: 'PLANTUML_UNREACHABLE' })
    }
  })

  return router
}
