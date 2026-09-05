import fs from 'node:fs'
import path from 'node:path'

export class PathSafetyError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PathSafetyError'
    this.code = 'UNSAFE_PATH'
  }
}

export function resolveSafePath(rootDir, relPath) {
  const rootReal = fs.realpathSync(rootDir)
  const candidate = path.resolve(rootDir, relPath)

  if (candidate !== rootDir && !candidate.startsWith(rootDir + path.sep)) {
    throw new PathSafetyError(`Path escapes root: ${relPath}`)
  }

  // Resolve symlinks along the way (if the target exists) and re-check —
  // path.resolve alone doesn't follow symlinks, so a symlink pointing
  // outside root would otherwise slip through the string-prefix check above.
  let realCandidate = candidate
  try {
    realCandidate = fs.realpathSync(candidate)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    // Target doesn't exist yet (e.g. a new file about to be created) —
    // walk up to the nearest existing ancestor and check that instead.
    let dir = path.dirname(candidate)
    while (!fs.existsSync(dir)) {
      dir = path.dirname(dir)
    }
    const realDir = fs.realpathSync(dir)
    if (realDir !== rootReal && !realDir.startsWith(rootReal + path.sep)) {
      throw new PathSafetyError(`Path escapes root via ancestor symlink: ${relPath}`)
    }
    return candidate
  }

  if (realCandidate !== rootReal && !realCandidate.startsWith(rootReal + path.sep)) {
    throw new PathSafetyError(`Path escapes root via symlink: ${relPath}`)
  }

  return candidate
}
