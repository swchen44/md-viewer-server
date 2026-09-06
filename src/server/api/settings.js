import express from 'express'
import { InvalidSettingsError, readSettings, updateSettings } from '../settings.js'

export function createSettingsRouter(configDir) {
  const router = express.Router()

  router.get('/settings', (req, res) => {
    res.set('Content-Type', 'application/json; charset=utf-8')
    res.json(readSettings(configDir))
  })

  router.put('/settings', (req, res) => {
    let updated
    try {
      updated = updateSettings(configDir, req.body ?? {})
    } catch (err) {
      if (err instanceof InvalidSettingsError) {
        return res
          .status(400)
          .json({ errorCode: 'INVALID_SETTINGS', invalidKeys: err.invalidKeys })
      }
      throw err
    }
    res.set('Content-Type', 'application/json; charset=utf-8')
    res.json(updated)
  })

  return router
}
