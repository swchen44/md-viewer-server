import express from 'express'
import fs from 'node:fs'
import { readFile, writeFile, ConflictError } from '../file-store.js'
import { resolveSafePath, PathSafetyError } from '../path-safety.js'

function findRoot(roots, rootId) {
  return roots.find((r) => r.id === Number(rootId))
}

export function createFileRouter(roots) {
  const router = express.Router()

  router.get('/file', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absPath = resolveSafePath(root.path, req.query.path)
      if (!fs.existsSync(absPath)) return res.status(404).json({ errorCode: 'FILE_NOT_FOUND' })

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
      const { content, mtimeMs, force, backup } = req.body
      const result = writeFile(root.path, req.query.path, content, {
        expectedMtimeMs: mtimeMs,
        force,
        backup,
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
