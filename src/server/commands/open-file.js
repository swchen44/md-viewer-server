import path from 'node:path'
import { getConfigDir } from '../xdg-paths.js'
import { readConfig } from '../config.js'
import { checkHealth } from '../daemon-utils.js'

// Pure function: match a user-supplied path (an absolute path, or one
// relative to the invoking process's cwd — which may differ from the
// daemon's own cwd) against one of the currently configured roots, and
// compute the relative path under that root. Mirrors the
// identical-or-nested check src/server/api/roots.js already uses for
// overlap detection, but also returns the relative path so the caller can
// pass it straight to POST /api/tabs.
export function resolvePathToRoot(inputPath, roots, cwd = process.cwd()) {
  const absPath = path.resolve(cwd, inputPath)
  for (const root of roots) {
    const rel = path.relative(root.path, absPath)
    const isSameOrNested = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
    if (isSameOrNested) {
      return { rootId: root.id, relPath: rel }
    }
  }
  return null
}

// A thin wrapper over POST /api/tabs — same pattern as add-root.js's
// runAddRoot(): read local config to find the running daemon and its
// configured roots, then just make the HTTP call. All the actual
// open-tab/broadcast logic lives server-side in src/server/api/tabs.js;
// this file must not reimplement it.
//
// Deliberately does NOT call POST /api/roots (Task 3's dynamic add-root
// endpoint) when the path is outside every configured root. "Open a file"
// and "expand the daemon's filesystem access" are two things that must
// never be silently bundled into the same command — see bin/cli.js's
// path-outside-roots message, which tells the user/agent to run `add-root`
// themselves first.
export async function runOpenFile(
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

  // config.roots is an array of path strings; the daemon assigns ids
  // contiguously by array index (see src/server/entry.js), so rebuild the
  // same {id, path} shape here rather than fetching GET /api/roots.
  const roots = config.roots.map((rootPath, id) => ({ id, path: rootPath }))
  const resolved = resolvePathToRoot(inputPath, roots, cwd)
  if (!resolved) {
    return { outcome: 'path-outside-roots' }
  }

  let res
  try {
    res = await fetch(`http://127.0.0.1:${config.port}/api/tabs`, {
      method: 'POST',
      headers: { 'X-Auth-Token': config.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: resolved.rootId, path: resolved.relPath }),
    })
  } catch {
    return { outcome: 'not-running' }
  }

  if (res.status === 201) {
    return { outcome: 'opened', rootId: resolved.rootId, relPath: resolved.relPath }
  }

  return { outcome: 'request-failed', status: res.status }
}
