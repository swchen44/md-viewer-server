import { WebSocketServer } from 'ws'
import { createWatcher } from './watcher.js'

export function createWsServer(httpServer, { token, roots }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.searchParams.get('token') !== token) {
      ws.close(4001, 'unauthorized')
      return
    }
  })

  const watcher = createWatcher(roots, (event) => {
    const message = JSON.stringify(event)
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message)
      }
    }
  })

  return {
    broadcast(event) {
      const message = JSON.stringify(event)
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send(message)
        }
      }
    },
    async close() {
      await watcher.close()
      await new Promise((resolve) => wss.close(resolve))
    },
  }
}
