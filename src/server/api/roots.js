import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { validateRoots } from '../commands/start.js'
import { appendRoot } from '../config.js'

// True if `a` and `b` are the same directory, or one is nested inside the
// other. Both `roots` and the incoming candidate path are already resolved
// absolute paths by the time this is called. path.relative('' result) means
// identical paths; a result that doesn't start with '..' and isn't itself
// absolute means the second path is nested inside the first.
function isNestedOrSame(a, b) {
  const rel = path.relative(a, b)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// A path.resolve()'d path can still be a symlink pointing at (or into) an
// already-configured root's real directory; comparing the resolved strings
// as-is would miss that and let a symlink alias bypass the overlap check
// entirely. Canonicalize through realpath for the comparison ONLY — what
// gets stored (via appendRoot and the in-memory roots array) stays whatever
// resolvedPath already is, to avoid the macOS /var -> /private/var-style
// symlink mismatch this codebase deliberately avoids elsewhere (see
// validateRoots in commands/start.js).
function overlapsExistingRoot(roots, candidatePath) {
  const candidateReal = fs.realpathSync(candidatePath)
  return roots.find((root) => {
    const rootReal = fs.realpathSync(root.path)
    return isNestedOrSame(rootReal, candidateReal) || isNestedOrSame(candidateReal, rootReal)
  })
}

export function createRootsRouter(roots, { configDir, daemonControl } = {}) {
  const router = express.Router()

  router.get('/roots', (req, res) => {
    res.json(roots.map((r) => ({ id: r.id, name: r.name })))
  })

  router.post('/roots', (req, res) => {
    const { path: rawPath } = req.body ?? {}

    // Reuse start.js's existing validateRoots rather than reimplementing
    // "does this path exist and is it readable" here.
    const { validRoots, skippedRoots } = validateRoots([rawPath])
    if (skippedRoots.length > 0) {
      res.status(400).json({ errorCode: 'INVALID_ROOT_PATH' })
      return
    }
    const resolvedPath = validRoots[0]

    // Reject a path that is identical to, a subdirectory of, or an ancestor
    // of any existing root — either direction would let the same files be
    // served twice under two different root ids, corrupting pagination and
    // search results. This is the security-relevant boundary this task
    // exists to enforce (see open's future refusal-not-auto-add behavior).
    const existing = overlapsExistingRoot(roots, resolvedPath)
    if (existing) {
      res.status(409).json({ errorCode: 'ROOT_OVERLAPS_EXISTING', existingRootId: existing.id })
      return
    }

    // ids are assigned contiguously from the initial roots.map(...) in
    // entry.js and this task deliberately does not support removing a root,
    // so the array never has gaps: the next id is always its current length.
    const newRoot = { id: roots.length, path: resolvedPath, name: path.basename(resolvedPath) }

    // Mutate the shared array in place (push, not reassignment) so every
    // router already holding a reference to `roots` sees the new entry
    // immediately, with no restart or re-registration needed.
    roots.push(newRoot)

    appendRoot(configDir, resolvedPath)
    daemonControl.addRootWatch(newRoot)
    daemonControl.broadcast({ type: 'root-added', rootId: newRoot.id, name: newRoot.name })

    res.status(201).json({ id: newRoot.id, name: newRoot.name })
  })

  return router
}
