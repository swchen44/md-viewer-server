import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { resolveSafePath, PathSafetyError } from '../path-safety.js'

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.md': 'text/plain',
}

const TEXT_LIKE = new Set(['.txt', '.md', '.svg'])

function findRoot(roots, rootId) {
  return roots.find((r) => r.id === Number(rootId))
}

export function createAssetRouter(roots) {
  const router = express.Router()

  router.get('/asset', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absPath = resolveSafePath(root.path, req.query.path)
      if (!fs.existsSync(absPath)) return res.status(404).json({ errorCode: 'FILE_NOT_FOUND' })

      const ext = path.extname(absPath).toLowerCase()
      const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
      const contentType = TEXT_LIKE.has(ext) ? `${mime}; charset=utf-8` : mime
      res.set('Content-Type', contentType)
      fs.createReadStream(absPath).pipe(res)
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  return router
}
