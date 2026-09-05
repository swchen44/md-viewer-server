import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  searchFileNames,
  searchFileContents,
  buildOutline,
  InvalidRegexError,
} from '../../../src/server/search.js'

describe('searchFileNames', () => {
  const files = [{ relPath: 'docs/plan.md' }, { relPath: 'src/index.js' }, { relPath: 'readme.md' }]

  it('matches by substring (case-insensitive)', () => {
    const result = searchFileNames(files, 'PLAN', {})
    expect(result).toEqual([{ relPath: 'docs/plan.md' }])
  })

  it('matches by regex when regex:true', () => {
    const result = searchFileNames(files, '\\.md$', { regex: true })
    expect(result.map((r) => r.relPath).sort()).toEqual(['docs/plan.md', 'readme.md'])
  })

  it('throws InvalidRegexError for a malformed pattern', () => {
    expect(() => searchFileNames(files, '(unclosed', { regex: true })).toThrow(InvalidRegexError)
  })

  it('returns an empty array when nothing matches', () => {
    expect(searchFileNames(files, 'nonexistent', {})).toEqual([])
  })
})

describe('searchFileContents', () => {
  let rootDir

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-content-'))
  })

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true })
  })

  it('finds matching lines with line numbers', () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'line one\nfind me here\nline three')
    const results = searchFileContents(rootDir, [{ relPath: 'a.md', size: 30 }], 'find me', {})
    expect(results).toEqual([
      { relPath: 'a.md', matches: [{ line: 2, text: 'find me here' }] },
    ])
  })

  it('is case-insensitive by default', () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'FIND ME')
    const results = searchFileContents(rootDir, [{ relPath: 'a.md', size: 10 }], 'find me', {})
    expect(results).toHaveLength(1)
  })

  it('supports regex matching', () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'call foo()\ncall bar()')
    const results = searchFileContents(rootDir, [{ relPath: 'a.md', size: 20 }], 'call \\w+\\(\\)', {
      regex: true,
    })
    expect(results[0].matches).toHaveLength(2)
  })

  it('caps results at 3 matching lines per file', () => {
    const content = Array.from({ length: 5 }, (_, i) => `match ${i}`).join('\n')
    fs.writeFileSync(path.join(rootDir, 'a.md'), content)
    const results = searchFileContents(rootDir, [{ relPath: 'a.md', size: 50 }], 'match', {})
    expect(results[0].matches).toHaveLength(3)
  })

  it('skips files larger than maxFileSizeBytes without scanning them', () => {
    fs.writeFileSync(path.join(rootDir, 'big.md'), 'find me')
    const results = searchFileContents(
      rootDir,
      [{ relPath: 'big.md', size: 10_000_000 }],
      'find me',
      { maxFileSizeBytes: 5_000_000 }
    )
    expect(results).toEqual([{ relPath: 'big.md', skipped: true }])
  })

  it('omits files with no matches from the results entirely', () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'nothing relevant')
    const results = searchFileContents(rootDir, [{ relPath: 'a.md', size: 20 }], 'find me', {})
    expect(results).toEqual([])
  })

  it('throws InvalidRegexError for a malformed pattern', () => {
    expect(() =>
      searchFileContents(rootDir, [{ relPath: 'a.md', size: 10 }], '(unclosed', { regex: true })
    ).toThrow(InvalidRegexError)
  })
})

describe('buildOutline', () => {
  it('extracts headings with level and line number', () => {
    const result = buildOutline('# Title\n\nSome text\n\n## Section One\n\ncontent\n\n### Sub')
    expect(result).toEqual([
      { level: 1, text: 'Title', line: 1 },
      { level: 2, text: 'Section One', line: 5 },
      { level: 3, text: 'Sub', line: 9 },
    ])
  })

  it('ignores # characters inside fenced code blocks', () => {
    const md = '# Real Heading\n\n```\n# not a heading\n```\n\n## Also Real'
    const result = buildOutline(md)
    expect(result).toEqual([
      { level: 1, text: 'Real Heading', line: 1 },
      { level: 2, text: 'Also Real', line: 7 },
    ])
  })

  it('returns an empty array for content with no headings', () => {
    expect(buildOutline('just plain text, no headings')).toEqual([])
  })
})
