import fs from 'node:fs'
import path from 'node:path'

export class InvalidRegexError extends Error {
  constructor(pattern) {
    super(`Invalid regular expression: ${pattern}`)
    this.name = 'InvalidRegexError'
    this.code = 'INVALID_REGEX'
  }
}

function buildMatcher(query, { regex }) {
  if (regex) {
    try {
      return new RegExp(query, 'i')
    } catch {
      throw new InvalidRegexError(query)
    }
  }
  const escaped = query.toLowerCase()
  return { test: (text) => text.toLowerCase().includes(escaped) }
}

export function searchFileNames(files, query, { regex } = {}) {
  const matcher = buildMatcher(query, { regex })
  return files.filter((f) => matcher.test(f.relPath))
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const MAX_MATCHES_PER_FILE = 3

export function searchFileContents(rootDir, files, query, { regex, maxFileSizeBytes } = {}) {
  const matcher = buildMatcher(query, { regex })
  const sizeLimit = maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES
  const results = []

  for (const file of files) {
    if (file.size > sizeLimit) {
      results.push({ relPath: file.relPath, skipped: true })
      continue
    }

    const absPath = path.join(rootDir, file.relPath)
    const lines = fs.readFileSync(absPath, 'utf-8').split('\n')
    const matches = []

    for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
      if (matcher.test(lines[i])) {
        matches.push({ line: i + 1, text: lines[i] })
      }
    }

    if (matches.length > 0) {
      results.push({ relPath: file.relPath, matches })
    }
  }

  return results
}

export function buildOutline(markdownContent) {
  const lines = markdownContent.split('\n')
  const headings = []
  let inFence = false

  lines.forEach((line, index) => {
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim(), line: index + 1 })
    }
  })

  return headings
}
