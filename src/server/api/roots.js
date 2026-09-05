import express from 'express'

export function createRootsRouter(roots) {
  const router = express.Router()

  router.get('/roots', (req, res) => {
    res.json(roots.map((r) => ({ id: r.id, name: r.name })))
  })

  return router
}
