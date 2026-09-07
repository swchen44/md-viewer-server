import express from 'express'
import { resolveSafePath, PathSafetyError } from '../path-safety.js'

function findRoot(roots, rootId) {
  return roots.find((r) => r.id === Number(rootId))
}

export function createFilePathRouter(roots) {
  const router = express.Router()

  router.get('/file-path', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absolutePath = resolveSafePath(root.path, req.query.path)
      res.json({ absolutePath })
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  return router
}
