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
      // Never pass the upstream's Content-Type through: /png/ is expected to
      // return a PNG, and echoing e.g. text/html would let an upstream render
      // attacker-controlled HTML on this app's own origin — where the auth
      // token lives in sessionStorage.
      res.set('Content-Type', 'image/png')
      res.set('X-Content-Type-Options', 'nosniff')
      res.send(buffer)
    } catch {
      res.status(502).json({ errorCode: 'PLANTUML_UNREACHABLE' })
    }
  })

  return router
}
