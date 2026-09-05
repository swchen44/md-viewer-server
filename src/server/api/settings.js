import express from 'express'
import { readSettings, updateSettings } from '../settings.js'

export function createSettingsRouter(configDir) {
  const router = express.Router()

  router.get('/settings', (req, res) => {
    res.set('Content-Type', 'application/json; charset=utf-8')
    res.json(readSettings(configDir))
  })

  router.put('/settings', (req, res) => {
    const updated = updateSettings(configDir, req.body)
    res.set('Content-Type', 'application/json; charset=utf-8')
    res.json(updated)
  })

  return router
}
