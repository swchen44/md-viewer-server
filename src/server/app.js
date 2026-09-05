import express from 'express'

export function createApp({ config, logger, getUptimeSeconds, packageVersion, onShutdown }) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({
      service: 'md-viewer-server',
      version: packageVersion,
      uptime: getUptimeSeconds(),
      roots: config.roots,
    })
  })

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
