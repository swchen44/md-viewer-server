import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuthMiddleware } from './auth-middleware.js'
import { createRootsRouter } from './api/roots.js'
import { createFilesRouter } from './api/files.js'
import { createFileRouter } from './api/file.js'
import { createRenameMkdirRouter } from './api/rename-mkdir.js'
import { createAssetRouter } from './api/asset.js'
import { createSearchRouter } from './api/search.js'
import { createSettingsRouter } from './api/settings.js'
import { createPlantUmlRouter } from './api/plantuml.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// esbuild's `define` (see scripts/build.js) substitutes this identifier
// throughout the whole bundle, including this module, whenever entry.js is
// built as dist/bundle.js. It doubles as the "am I running bundled?" check:
// bundled, this file's code executes as part of dist/bundle.js, so
// import.meta.url (and therefore __dirname above) resolves to dist/, and
// dist/frontend/ is a sibling of it. Running from source, __dirname is
// src/server/, two levels below the project root, where dist/frontend/
// actually lives. See src/server/entry.js's readPackageVersion() for the
// same pattern applied to the version string.
const FRONTEND_DIST =
  typeof __MVS_BUNDLED_VERSION__ !== 'undefined'
    ? path.join(__dirname, 'frontend')
    : path.join(__dirname, '..', '..', 'dist', 'frontend')

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

  // Registered after every /api route above, so Express (which matches
  // routes in registration order) never lets this shadow an API request. A
  // request under /api/* reaching this point matches no real API route
  // above — either the path doesn't exist or it exists under a different
  // HTTP method (e.g. GET /api/shutdown, which is POST-only). Either way it
  // must 404 as JSON rather than silently falling through to the SPA shell
  // (which would return a misleading 200 index.html to API callers checking
  // res.ok) or to Express's default HTML 404. app.all (not app.get) so this
  // also catches non-GET requests, which app.get('*', ...) below never sees.
  app.all('/api/*', (req, res) => {
    res.status(404).json({ errorCode: 'NOT_FOUND' })
  })

  // No authMiddleware here on purpose: the browser needs to load the JS
  // bundle before it can read the token out of the URL and store it in
  // sessionStorage (see src/frontend/auth.ts's initAuthFromUrl()), so the
  // static shell itself must be servable without the token.
  app.use(express.static(FRONTEND_DIST))
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'))
  })

  return app
}
