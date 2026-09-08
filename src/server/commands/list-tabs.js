import { getConfigDir } from '../xdg-paths.js'
import { readConfig } from '../config.js'
import { checkHealth } from '../daemon-utils.js'

// A thin wrapper over GET /api/tabs, joined with GET /api/roots so each tab
// carries a human-readable root name instead of just a numeric rootId — the
// `tabs` CLI command wants readable output ("notes.md in project-a"), and
// the name is only known server-side (roots.js computes it, e.g. via
// path.basename, and it is never persisted in config.json alongside the raw
// root path). Same pattern as close-file.js's runCloseFile(): read local
// config to find the running daemon, then just make the HTTP calls — no
// business logic duplicated from the server routes.
export async function runListTabs({ configDir = getConfigDir() } = {}) {
  const config = readConfig(configDir)
  if (!config) {
    return { outcome: 'not-configured' }
  }

  const health = await checkHealth(config.port)
  if (!health) {
    return { outcome: 'not-running' }
  }

  let tabs
  let roots
  try {
    const [tabsRes, rootsRes] = await Promise.all([
      fetch(`http://127.0.0.1:${config.port}/api/tabs`, {
        headers: { 'X-Auth-Token': config.token },
      }),
      fetch(`http://127.0.0.1:${config.port}/api/roots`, {
        headers: { 'X-Auth-Token': config.token },
      }),
    ])
    tabs = await tabsRes.json()
    roots = await rootsRes.json()
  } catch {
    return { outcome: 'not-running' }
  }

  const nameById = new Map(roots.map((root) => [root.id, root.name]))
  const enriched = tabs.map((tab) => ({
    rootId: tab.rootId,
    relPath: tab.relPath,
    // A tab's root can, in principle, have been removed from the roots list
    // between the two fetches above (or reference an id the server no
    // longer knows about) — fall back to a synthetic label rather than
    // printing `undefined`.
    rootName: nameById.get(tab.rootId) ?? `root ${tab.rootId}`,
  }))

  return { outcome: 'listed', tabs: enriched }
}
