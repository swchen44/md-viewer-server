import { WebSocketServer } from 'ws'
import { createWatcher } from './watcher.js'

export function createWsServer(httpServer, { token, roots }) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  function broadcastToClients(event) {
    const message = JSON.stringify(event)
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message)
      }
    }
  }

  wss.on('connection', (ws, req) => {
    ws.on('error', () => {
      // Swallow per-client socket errors so one bad connection can't crash the daemon.
      // (No logger is injected into this module; if that changes later, log here.)
    })

    const url = new URL(req.url, 'http://localhost')
    if (url.searchParams.get('token') !== token) {
      ws.close(4001, 'unauthorized')
      return
    }
  })

  const watcher = createWatcher(roots, (event) => {
    broadcastToClients(event)
  })

  return {
    broadcast(event) {
      broadcastToClients(event)
    },
    async close() {
      for (const client of wss.clients) {
        client.terminate()
      }
      await watcher.close()
      await new Promise((resolve) => wss.close(resolve))
    },
  }
}
