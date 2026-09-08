import chokidar from 'chokidar'
import path from 'node:path'

const WATCH_DEPTH = 10

export function createWatcher(roots, onEvent) {
  // Builds and starts a chokidar watcher for a single root, wiring its
  // events through to onEvent. Used both for the roots this watcher starts
  // with and for addRoot(...) below, so there is exactly one place that
  // defines the chokidar options/event wiring for a root.
  function buildWatcherForRoot(root) {
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
  }

  const watchers = roots.map((root) => buildWatcherForRoot(root))

  return {
    addRoot(root) {
      watchers.push(buildWatcherForRoot(root))
    },
    async close() {
      await Promise.all(watchers.map((w) => w.close()))
    },
  }
}
