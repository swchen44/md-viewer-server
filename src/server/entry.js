import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getConfigDir, getStateDir } from './xdg-paths.js'
import { readConfig } from './config.js'
import { createLogger } from './logger.js'
import { createApp } from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function readPackageVersion() {
  if (typeof __MVS_BUNDLED_VERSION__ !== 'undefined') {
    return __MVS_BUNDLED_VERSION__
  }
  const pkgPath = path.join(__dirname, '..', '..', 'package.json')
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version
}

export function startServer({ logLevel = 'info' } = {}) {
  const configDir = getConfigDir()
  const stateDir = getStateDir()
  fs.mkdirSync(stateDir, { recursive: true })

  const config = readConfig(configDir)
  if (!config) {
    throw new Error(
      'config.json not found; the start command must create it before spawning entry.js'
    )
  }

  const logger = createLogger({
    logFilePath: path.join(stateDir, 'server.log'),
    level: logLevel,
  })

  const startedAt = Date.now()

  function gracefulShutdown(source) {
    logger.info({ source }, 'shutting down')
    server.close(() => {
      logger.info({}, 'server closed')
      process.exit(0)
    })
  }

  const app = createApp({
    config,
    logger,
    getUptimeSeconds: () => Math.floor((Date.now() - startedAt) / 1000),
    packageVersion: readPackageVersion(),
    onShutdown: () => gracefulShutdown('api'),
  })

  const server = http.createServer(app)

  process.on('SIGTERM', () => gracefulShutdown('signal'))

  server.on('error', (err) => {
    logger.error({ err: err.message, code: err.code }, 'server failed to start')
    process.exit(1)
  })

  server.listen(config.port, '0.0.0.0', () => {
    fs.writeFileSync(path.join(stateDir, 'server.pid'), String(process.pid))
    logger.info({ port: server.address().port }, 'server listening')
  })

  return server
}

function isMainModule() {
  // import.meta.url is resolved through realpath (e.g. macOS's /tmp ->
  // /private/tmp, /var -> /private/var), but process.argv[1] is not, so a
  // literal string comparison can spuriously fail whenever the script is
  // invoked through a path that traverses a symlink (as happens for tmp
  // dirs used in isolated deployment testing). Resolve both sides the
  // same way before comparing.
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
  } catch {
    return false
  }
}

if (isMainModule()) {
  startServer()
}
