import chokidar from 'chokidar'
import path from 'node:path'

const WATCH_DEPTH = 10

export function createWatcher(roots, onEvent) {
  const watchers = roots.map((root) => {
    const watcher = chokidar.watch(root.path, {
      ignored: /(^|[/\\])(node_modules|\.git)([/\\]|$)/,
      depth: WATCH_DEPTH,
      ignoreInitial: true,
      followSymlinks: false,
    })

    watcher.on('add', (filePath) => {
      onEvent({ type: 'file-added', rootId: root.id, relPath: path.relative(root.path, filePath) })
    })
    watcher.on('change', (filePath) => {
      onEvent({
        type: 'file-changed',
        rootId: root.id,
        relPath: path.relative(root.path, filePath),
      })
    })
    watcher.on('unlink', (filePath) => {
      onEvent({
        type: 'file-removed',
        rootId: root.id,
        relPath: path.relative(root.path, filePath),
      })
    })
    watcher.on('error', (err) => {
      onEvent({ type: 'watch-error', rootId: root.id, message: err.message })
    })

    return watcher
  })

  return {
    async close() {
      await Promise.all(watchers.map((w) => w.close()))
    },
  }
}
