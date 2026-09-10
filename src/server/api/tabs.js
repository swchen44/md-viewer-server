import express from 'express'
import { resolveSafePath, PathSafetyError } from '../path-safety.js'
import { findRoot, parseRootId } from '../root-params.js'

export function createTabsRouter(roots, registry, daemonControl) {
  const router = express.Router()

  router.get('/tabs', (req, res) => {
    res.json(registry.list())
  })

  router.post('/tabs', (req, res) => {
    const { root, path: relPath } = req.body
    const rootEntry = findRoot(roots, root)
    if (!rootEntry) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      // open intentionally does NOT require the file to already exist on
      // disk — an AI caller may want the tab to appear a moment before the
      // file write finishes, and the frontend only actually reads content
      // via GET /api/file after receiving the tab-opened event (falling
      // back to its existing loadError UI if that read fails). Path safety
      // is still enforced so this endpoint can't be used to probe paths
      // outside the root.
      resolveSafePath(rootEntry.path, relPath)
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }

    registry.open(rootEntry.id, relPath)
    daemonControl.broadcast({ type: 'tab-opened', rootId: rootEntry.id, relPath })
    res.status(201).json({ rootId: rootEntry.id, relPath })
  })

  router.delete('/tabs', (req, res) => {
    const { root, path: relPath } = req.body
    const rootId = parseRootId(root)
    if (rootId === null) return res.status(400).json({ errorCode: 'INVALID_ROOT_ID' })
    if (typeof relPath !== 'string' || relPath.length === 0) {
      return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
    }
    // No ROOT_NOT_FOUND check here on purpose: close is idempotent, so
    // closing a tab under an unknown/no-longer-existing root must still
    // succeed as a harmless no-op rather than error out.
    registry.close(rootId, relPath)
    daemonControl.broadcast({ type: 'tab-closed', rootId, relPath })
    res.status(200).json({})
  })

  return router
}
