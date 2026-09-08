import path from 'node:path'
import { getConfigDir } from '../xdg-paths.js'
import { readConfig } from '../config.js'
import { checkHealth } from '../daemon-utils.js'
import { resolvePathToRoot } from './open-file.js'

// A thin wrapper over GET/DELETE /api/tabs — same pattern as open-file.js's
// runOpenFile(). Literal paths take precedence: if inputPath resolves to a
// concrete {rootId, relPath} via resolvePathToRoot (Task 4's function,
// reused as-is), close exactly that tab, no fuzzy matching. Only when
// inputPath does NOT resolve to any configured root (e.g. a bare filename
// that isn't a valid relative path under any root) does this fall back to
// matching path.basename(relPath) against the current open-tabs list — see
// the design spec's rationale: `close` is meant for "close a tab I
// remember by name", so bare filenames are allowed, but a collision must
// never be guessed at.
export async function runCloseFile(
  inputPath,
  { configDir = getConfigDir(), cwd = process.cwd() } = {}
) {
  const config = readConfig(configDir)
  if (!config) {
    return { outcome: 'not-configured' }
  }

  const health = await checkHealth(config.port)
  if (!health) {
    return { outcome: 'not-running' }
  }

  let tabs
  try {
    const listRes = await fetch(`http://127.0.0.1:${config.port}/api/tabs`, {
      headers: { 'X-Auth-Token': config.token },
    })
    tabs = await listRes.json()
  } catch {
    return { outcome: 'not-running' }
  }

  // config.roots is an array of path strings; the daemon assigns ids
  // contiguously by array index (see src/server/entry.js), so rebuild the
  // same {id, path} shape here rather than fetching GET /api/roots.
  const roots = config.roots.map((rootPath, id) => ({ id, path: rootPath }))
  const resolved = resolvePathToRoot(inputPath, roots, cwd)

  let target
  if (resolved) {
    target = resolved
  } else {
    const candidates = tabs.filter((tab) => path.basename(tab.relPath) === inputPath)
    if (candidates.length === 0) {
      return { outcome: 'not-found' }
    }
    if (candidates.length > 1) {
      return { outcome: 'ambiguous', candidates }
    }
    target = candidates[0]
  }

  await fetch(`http://127.0.0.1:${config.port}/api/tabs`, {
    method: 'DELETE',
    headers: { 'X-Auth-Token': config.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ root: target.rootId, path: target.relPath }),
  })

  return { outcome: 'closed', rootId: target.rootId, relPath: target.relPath }
}
