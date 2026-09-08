import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getConfigDir, getStateDir } from './xdg-paths.js'
import { readConfig } from './config.js'
import { createLogger } from './logger.js'
import { createApp } from './app.js'
import { createWsServer } from './ws-server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FILE_EXTENSIONS = [
  '.md',
  '.markdown',
  '.mkd',
  '.mdx',
  '.mdc',
  '.txt',
  '.mmd',
  '.html',
  '.puml',
  '.plantuml',
]

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

  process.on('uncaughtException', (err) => {
    logger.error({ err: err.message, stack: err.stack }, 'uncaught exception (process kept alive)')
  })

  const startedAt = Date.now()

  const roots = config.roots.map((rootPath, id) => ({
    id,
    path: rootPath,
    name: path.basename(rootPath),
  }))

  let wsServer = null
  const openSockets = new Set()

  // createApp(...) happens before createWsServer(...) below (wsServer only
  // exists once server.listen()'s callback runs), but REST routes need to
  // call wsServer.broadcast(...) and a "start watching a new root" method.
  // daemonControl is a mutable reference object handed to createApp/routers
  // up front as a no-op placeholder; its methods are reassigned to the real
  // implementations once wsServer actually exists. Routers always call
  // daemonControl.broadcast(...)/daemonControl.addRootWatch(...) — never
  // wsServer directly — so they don't need to care about this ordering.
  const daemonControl = {
    broadcast: () => {},
    addRootWatch: () => {},
  }

  async function gracefulShutdown(source) {
    logger.info({ source }, 'shutting down')
    if (wsServer) {
      await wsServer.close()
    }
    server.close(() => {
      logger.info({}, 'server closed')
      process.exit(0)
    })
    // server.close()'s callback only fires once every currently-open socket
    // has closed on its own, which a long-lived client (a WebSocket, or a
    // fresh reconnect landing mid-shutdown) may never do. Forcibly destroy
    // whatever is still open so shutdown always completes promptly.
    for (const socket of openSockets) {
      socket.destroy()
    }
  }

  const app = createApp({
    config,
    logger,
    getUptimeSeconds: () => Math.floor((Date.now() - startedAt) / 1000),
    packageVersion: readPackageVersion(),
    onShutdown: () => gracefulShutdown('api'),
    roots,
    extensions: FILE_EXTENSIONS,
    configDir,
    daemonControl,
  })

  const server = http.createServer(app)

  server.on('connection', (socket) => {
    openSockets.add(socket)
    socket.on('close', () => openSockets.delete(socket))
  })

  process.on('SIGTERM', () => gracefulShutdown('signal'))

  server.on('error', (err) => {
    logger.error({ err: err.message, code: err.code }, 'server failed to start')
    process.exit(1)
  })

  server.listen(config.port, '0.0.0.0', () => {
    fs.writeFileSync(path.join(stateDir, 'server.pid'), String(process.pid))
    logger.info({ port: server.address().port }, 'server listening')
    wsServer = createWsServer(server, { token: config.token, roots })
    daemonControl.broadcast = wsServer.broadcast.bind(wsServer)
    // addRootWatch is wired to the watcher's real addRoot(...) in Task 3
    // once that method exists; it stays a no-op until then.
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
