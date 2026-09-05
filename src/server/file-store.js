import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { resolveSafePath } from './path-safety.js'

export class ConflictError extends Error {
  constructor(currentContent, currentMtimeMs) {
    super('File was modified since it was read')
    this.name = 'ConflictError'
    this.code = 'CONFLICT'
    this.currentContent = currentContent
    this.currentMtimeMs = currentMtimeMs
  }
}

function isValidUtf8(buffer) {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    return decoded
  } catch {
    return null
  }
}

export function readFile(rootDir, relPath) {
  const absPath = resolveSafePath(rootDir, relPath)
  const buffer = fs.readFileSync(absPath)
  const stat = fs.statSync(absPath)
  const decoded = isValidUtf8(buffer)

  return {
    content: decoded ?? buffer.toString('utf-8'),
    mtimeMs: stat.mtimeMs,
    encoding: decoded !== null ? 'utf-8' : 'unknown',
  }
}

export function writeFile(rootDir, relPath, content, { expectedMtimeMs, force, backup } = {}) {
  const absPath = resolveSafePath(rootDir, relPath)
  const exists = fs.existsSync(absPath)

  if (exists && expectedMtimeMs != null && !force) {
    const currentStat = fs.statSync(absPath)
    if (currentStat.mtimeMs !== expectedMtimeMs) {
      const currentContent = fs.readFileSync(absPath, 'utf-8')
      throw new ConflictError(currentContent, currentStat.mtimeMs)
    }
  }

  if (exists && backup) {
    fs.copyFileSync(absPath, `${absPath}.bak`)
  }

  const tmpPath = `${absPath}.${crypto.randomBytes(6).toString('hex')}.tmp`
  fs.writeFileSync(tmpPath, content, 'utf-8')
  fs.renameSync(tmpPath, absPath)

  return { mtimeMs: fs.statSync(absPath).mtimeMs }
}

export function listFiles(rootDir, extensions) {
  const results = []

  function walk(dir, relBase) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absEntryPath = path.join(dir, entry.name)
      const relEntryPath = relBase ? path.join(relBase, entry.name) : entry.name

      if (entry.isDirectory()) {
        walk(absEntryPath, relEntryPath)
      } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
        const stat = fs.statSync(absEntryPath)
        results.push({ relPath: relEntryPath, size: stat.size, mtimeMs: stat.mtimeMs })
      }
    }
  }

  walk(rootDir, '')
  return results
}
