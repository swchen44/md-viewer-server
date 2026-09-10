import express from 'express'
import { listFiles } from '../file-store.js'
import { findRoot } from '../root-params.js'

export function createFilesRouter(roots, extensions) {
  const router = express.Router()

  router.get('/files', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) {
      res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })
      return
    }
    const files = listFiles(root.path, extensions)
    res.json({ files })
  })

  return router
}
