import express from 'express'
import fs from 'node:fs'
import { listFiles, readFile } from '../file-store.js'
import { resolveSafePath, PathSafetyError } from '../path-safety.js'
import {
  searchFileNames,
  searchFileContents,
  buildOutline,
  InvalidRegexError,
} from '../search.js'
import { RegexTimeoutError } from '../regex-timeout.js'

function findRoot(roots, rootId) {
  return roots.find((r) => r.id === Number(rootId))
}

// Normalizes the `openPaths` query param to a flat array of path strings no
// matter which shape the configured query parser produced it in.
function normalizeOpenPaths(openPaths) {
  if (openPaths === undefined) return []
  if (Array.isArray(openPaths)) return openPaths
  if (typeof openPaths === 'object' && openPaths !== null) return Object.values(openPaths)
  return [openPaths]
}

export function createSearchRouter(roots, extensions) {
  const router = express.Router()

  router.get('/search', async (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    const { q = '', target = 'both', scope = 'all', regex, openPaths } = req.query

    if (!q.trim()) {
      res.set('Content-Type', 'application/json; charset=utf-8')
      return res.json({ fileMatches: [], contentMatches: [] })
    }

    const isRegex = regex === 'true'

    let files = listFiles(root.path, extensions)
    if (scope === 'open') {
      // openPaths arrives as `undefined` (no open tabs), a single string (one
      // open tab), an array (multiple open tabs, up to whatever arrayLimit
      // the configured query parser allows), or — once the number of
      // repeated `openPaths=...` params exceeds that arrayLimit — a plain
      // object keyed by index (qs's overflow behavior: index 0, 1, 2, ...
      // instead of continuing the array). Repeated params (rather than one
      // comma-joined value) is deliberate: POSIX filenames can legally
      // contain a literal comma, which a join/split round-trip would
      // silently corrupt. normalizeOpenPaths below flattens all of these
      // shapes to a plain array so a large number of open tabs is handled
      // correctly regardless of the parser's arrayLimit, rather than assuming
      // a value past the limit will always look like an array.
      const openSet = new Set(normalizeOpenPaths(openPaths).map((p) => String(p)))
      files = files.filter((f) => openSet.has(f.relPath))
    }

    try {
      const fileMatches =
        target === 'name' || target === 'both'
          ? await searchFileNames(files, q, { regex: isRegex })
          : []
      const contentMatches =
        target === 'content' || target === 'both'
          ? await searchFileContents(root.path, files, q, { regex: isRegex })
          : []

      res.set('Content-Type', 'application/json; charset=utf-8')
      res.json({ fileMatches, contentMatches })
    } catch (err) {
      if (err instanceof InvalidRegexError) {
        return res.status(400).json({ errorCode: 'INVALID_REGEX' })
      }
      if (err instanceof RegexTimeoutError) {
        return res.status(400).json({ errorCode: 'REGEX_TIMEOUT' })
      }
      throw err
    }
  })

  router.get('/outline', (req, res) => {
    const root = findRoot(roots, req.query.root)
    if (!root) return res.status(404).json({ errorCode: 'ROOT_NOT_FOUND' })

    try {
      const absPath = resolveSafePath(root.path, req.query.path)
      if (!fs.existsSync(absPath)) return res.status(404).json({ errorCode: 'FILE_NOT_FOUND' })

      const { content } = readFile(root.path, req.query.path)
      const headings = buildOutline(content)
      res.set('Content-Type', 'application/json; charset=utf-8')
      res.json({ headings })
    } catch (err) {
      if (err instanceof PathSafetyError) return res.status(400).json({ errorCode: 'UNSAFE_PATH' })
      throw err
    }
  })

  return router
}
