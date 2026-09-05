import fs from 'node:fs'
import path from 'node:path'
import { runRegexMatch } from './regex-timeout.js'

export class InvalidRegexError extends Error {
  constructor(pattern) {
    super(`Invalid regular expression: ${pattern}`)
    this.name = 'InvalidRegexError'
    this.code = 'INVALID_REGEX'
  }
}

const MAX_QUERY_LENGTH = 200

function validateRegexSyntax(query) {
  if (query.length > MAX_QUERY_LENGTH) {
    throw new InvalidRegexError(query)
  }
  try {
    // Constructing the RegExp only checks syntax and is safe/cheap; the actual
    // execution against real strings (the ReDoS risk) happens in a worker
    // thread with a hard timeout via runRegexMatch.
    new RegExp(query, 'i')
  } catch {
    throw new InvalidRegexError(query)
  }
}

function buildSubstringMatcher(query) {
  const escaped = query.toLowerCase()
  return { test: (text) => text.toLowerCase().includes(escaped) }
}

export async function searchFileNames(files, query, { regex } = {}) {
  if (regex) {
    validateRegexSyntax(query)
    const matchedIndexes = await runRegexMatch(
      query,
      files.map((f) => f.relPath)
    )
    return matchedIndexes.map((i) => files[i])
  }
  const matcher = buildSubstringMatcher(query)
  return files.filter((f) => matcher.test(f.relPath))
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const MAX_MATCHES_PER_FILE = 3

export async function searchFileContents(rootDir, files, query, { regex, maxFileSizeBytes } = {}) {
  if (regex) {
    validateRegexSyntax(query)
  }
  const matcher = regex ? null : buildSubstringMatcher(query)
  const sizeLimit = maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES
  const results = []

  for (const file of files) {
    if (file.size > sizeLimit) {
      results.push({ relPath: file.relPath, skipped: true })
      continue
    }

    const absPath = path.join(rootDir, file.relPath)
    const lines = fs.readFileSync(absPath, 'utf-8').split('\n')
    let matches

    if (regex) {
      const matchedIndexes = (await runRegexMatch(query, lines)).slice(0, MAX_MATCHES_PER_FILE)
      matches = matchedIndexes.map((i) => ({ line: i + 1, text: lines[i] }))
    } else {
      matches = []
      for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
        if (matcher.test(lines[i])) {
          matches.push({ line: i + 1, text: lines[i] })
        }
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
