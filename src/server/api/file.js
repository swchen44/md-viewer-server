import express from 'express'
import fs from 'node:fs'
import { readFile, writeFile, ConflictError } from '../file-store.js'
import { resolveSafePath, PathSafetyError } from '../path-safety.js'
import { readSettings } from '../settings.js'
import { findRoot } from '../root-params.js'

// Opening a file this large and attempting a full render (syntax-highlighted
// editor, diagram rendering, etc.) risks freezing the tab. The threshold is
// a fixed constant, not a user-adjustable setting — the design spec only
// says "e.g. 5MB" as an illustrative guard, not a request for configurability.
const MAX_RENDERABLE_BYTES = 5 * 1024 * 1024

export function createFileRouter(roots, configDir) {
  const router = express.Router()

  router.get('/file', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absPath = resolveSafePath(root.path, req.query.path)
      if (!fs.existsSync(absPath)) return res.status(404).json({ errorCode: 'FILE_NOT_FOUND' })

      // Check size via statSync BEFORE reading — reading the full file into
      // memory (and serializing it into the response) here would defeat the
      // entire point of the guard even if the response then claims tooLarge.
      const stat = fs.statSync(absPath)
      if (stat.size > MAX_RENDERABLE_BYTES) {
        res.set('Content-Type', 'application/json; charset=utf-8')
        // encoding is honestly reported as 'unknown' rather than guessed as
        // 'utf-8': determining the real encoding would require reading the
        // file, which is exactly what this guard avoids doing.
        return res.json({ content: null, mtimeMs: stat.mtimeMs, encoding: 'unknown', tooLarge: true })
      }

      const result = readFile(root.path, req.query.path)
      res.set('Content-Type', 'application/json; charset=utf-8')
      res.json(result)
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  router.put('/file', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const { content, mtimeMs, force } = req.body
      // Whether a .bak is kept is a persisted server-side setting the user
      // configures once, not a per-request client choice: reading it from the
      // request body let any caller silently skip the backup the user asked
      // for (or force one they turned off). Any `backup` field in the body is
      // deliberately ignored — same "settings decide, requests don't" rule the
      // plantuml proxy follows for effective.sendToPlantUmlServer.
      const { bakOnSave } = readSettings(configDir)
      const result = writeFile(root.path, req.query.path, content, {
        expectedMtimeMs: mtimeMs,
        force,
        backup: bakOnSave,
      })
      res.json(result)
    } catch (err) {
      if (err instanceof ConflictError) {
        return res.status(409).json({
          errorCode: 'CONFLICT',
          currentContent: err.currentContent,
          currentMtimeMs: err.currentMtimeMs,
        })
      }
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  router.post('/file', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absPath = resolveSafePath(root.path, req.query.path)
      if (fs.existsSync(absPath)) return res.status(409).json({ errorCode: 'FILE_EXISTS' })
      writeFile(root.path, req.query.path, '', {})
      res.status(201).json({})
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  router.delete('/file', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absPath = resolveSafePath(root.path, req.query.path)
      if (!fs.existsSync(absPath)) return res.status(404).json({ errorCode: 'FILE_NOT_FOUND' })
      fs.unlinkSync(absPath)
      res.status(204).end()
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  return router
}
