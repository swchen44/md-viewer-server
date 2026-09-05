import express from 'express'
import fs from 'node:fs'
import { resolveSafePath, PathSafetyError } from '../path-safety.js'

function findRoot(roots, rootId) {
  return roots.find((r) => r.id === Number(rootId))
}

export function createRenameMkdirRouter(roots) {
  const router = express.Router()

  router.post('/rename', (req, res) => {
    const root = findRoot(roots, req.body.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const fromPath = resolveSafePath(root.path, req.body.from)
      const toPath = resolveSafePath(root.path, req.body.to)
      if (!fs.existsSync(fromPath)) return res.status(404).json({ errorCode: 'FILE_NOT_FOUND' })
      fs.renameSync(fromPath, toPath)
      res.json({})
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  router.post('/mkdir', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absPath = resolveSafePath(root.path, req.query.path)
      fs.mkdirSync(absPath, { recursive: true })
      res.status(201).json({})
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  return router
}
