import express from 'express'
import { createAuthMiddleware } from './auth-middleware.js'
import { createRootsRouter } from './api/roots.js'
import { createFilesRouter } from './api/files.js'
import { createFileRouter } from './api/file.js'
import { createRenameMkdirRouter } from './api/rename-mkdir.js'
import { createAssetRouter } from './api/asset.js'
import { createSearchRouter } from './api/search.js'
import { createSettingsRouter } from './api/settings.js'
import { createPlantUmlRouter } from './api/plantuml.js'

export function createApp({
  config,
  logger,
  getUptimeSeconds,
  packageVersion,
  onShutdown,
  roots = [],
  extensions = [],
  configDir,
}) {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.get('/api/health', (req, res) => {
    res.json({
      service: 'md-viewer-server',
      version: packageVersion,
      uptime: getUptimeSeconds(),
      roots: config.roots,
    })
  })

  const authMiddleware = createAuthMiddleware(config)
  app.use('/api', authMiddleware, createRootsRouter(roots))
  app.use('/api', authMiddleware, createFilesRouter(roots, extensions))
  app.use('/api', authMiddleware, createFileRouter(roots))
  app.use('/api', authMiddleware, createRenameMkdirRouter(roots))
  app.use('/api', authMiddleware, createAssetRouter(roots))
  app.use('/api', authMiddleware, createSearchRouter(roots, extensions))
  app.use('/api', authMiddleware, createSettingsRouter(configDir))
  app.use('/api', authMiddleware, createPlantUmlRouter(configDir))

  app.post('/api/shutdown', (req, res) => {
    const token = req.header('X-Auth-Token')
    if (token !== config.token) {
      logger.warn({ auth: 'fail' }, 'rejected shutdown request')
      res.status(401).json({ errorCode: 'UNAUTHORIZED' })
      return
    }
    logger.info({ auth: 'ok' }, 'shutdown requested')
    res.json({ status: 'shutting-down' })
    onShutdown()
  })

  return app
}
