// In-memory registry of "currently open tabs" shared across all connected
// browsers. Intentionally NOT persisted to config.json — this is runtime
// state (same category as chokidar watcher state), so it resetting on
// daemon restart is expected, not a bug. See
// docs/superpowers/plans/2026-09-07-remote-tab-control.md.
export function createOpenTabsRegistry() {
  const tabs = new Map()

  function key(rootId, relPath) {
    return `${rootId}:${relPath}`
  }

  return {
    open(rootId, relPath) {
      tabs.set(key(rootId, relPath), { rootId, relPath })
    },
    close(rootId, relPath) {
      tabs.delete(key(rootId, relPath))
    },
    list() {
      return Array.from(tabs.values())
    },
  }
}
