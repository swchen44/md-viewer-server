import express from 'express'
import { listFiles } from '../file-store.js'

export function createFilesRouter(roots, extensions) {
  const router = express.Router()

  router.get('/files', (req, res) => {
    const rootId = Number(req.query.root)
    const root = roots.find((r) => r.id === rootId)
    if (!root) {
      res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })
      return
    }
    const files = listFiles(root.path, extensions)
    res.json({ files })
  })

  return router
}
