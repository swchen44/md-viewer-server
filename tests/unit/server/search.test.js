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
import { RegexTimeoutError } from '../../../src/server/regex-timeout.js'

describe('searchFileNames', () => {
  const files = [{ relPath: 'docs/plan.md' }, { relPath: 'src/index.js' }, { relPath: 'readme.md' }]

  it('matches by substring (case-insensitive)', async () => {
    const result = await searchFileNames(files, 'PLAN', {})
    expect(result).toEqual([{ relPath: 'docs/plan.md' }])
  })

  it('matches by regex when regex:true', async () => {
    const result = await searchFileNames(files, '\\.md$', { regex: true })
    expect(result.map((r) => r.relPath).sort()).toEqual(['docs/plan.md', 'readme.md'])
  })

  it('throws InvalidRegexError for a malformed pattern', async () => {
    await expect(searchFileNames(files, '(unclosed', { regex: true })).rejects.toThrow(
      InvalidRegexError
    )
  })

  it('returns an empty array when nothing matches', async () => {
    expect(await searchFileNames(files, 'nonexistent', {})).toEqual([])
  })

  it('throws InvalidRegexError for a query longer than 200 characters', async () => {
    const longQuery = 'a'.repeat(201)
    await expect(searchFileNames(files, longQuery, { regex: true })).rejects.toThrow(
      InvalidRegexError
    )
  })

  it(
    'rejects with RegexTimeoutError when a catastrophic-backtracking pattern is actually run, ' +
      'via worker-thread timeout',
    async () => {
      // (a|a)+$ against a long run of 'a's followed by a non-matching char is a classic
      // alternation-overlap catastrophic backtracking case that a shape-based denylist
      // cannot detect (there's no nested quantifier-in-group shape here).
      const worstCase = 'a'.repeat(35) + '!'
      const start = Date.now()
      await expect(searchFileNames([{ relPath: worstCase }], '(a|a)+$', { regex: true })).rejects.toThrow(
        RegexTimeoutError
      )
      const elapsedMs = Date.now() - start
      // Proves the worker's own 2000ms internal timeout actually fired (and terminated the
      // hung worker) rather than the test instantly passing without exercising the timeout path.
      expect(elapsedMs).toBeGreaterThanOrEqual(1900)
      expect(elapsedMs).toBeLessThan(10000)
    },
    10000
  )

  it('does not reject benign patterns with a single group and quantifier', async () => {
    await expect(searchFileNames(files, '(abc)+', { regex: true })).resolves.not.toThrow()
    await expect(searchFileNames(files, '\\.md$', { regex: true })).resolves.not.toThrow()
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

  it('finds matching lines with line numbers', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'line one\nfind me here\nline three')
    const results = await searchFileContents(rootDir, [{ relPath: 'a.md', size: 30 }], 'find me', {})
    expect(results).toEqual([
      { relPath: 'a.md', matches: [{ line: 2, text: 'find me here' }] },
    ])
  })

  it('is case-insensitive by default', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'FIND ME')
    const results = await searchFileContents(rootDir, [{ relPath: 'a.md', size: 10 }], 'find me', {})
    expect(results).toHaveLength(1)
  })

  it('supports regex matching', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'call foo()\ncall bar()')
    const results = await searchFileContents(
      rootDir,
      [{ relPath: 'a.md', size: 20 }],
      'call \\w+\\(\\)',
      { regex: true }
    )
    expect(results[0].matches).toHaveLength(2)
  })

  it('caps results at 3 matching lines per file', async () => {
    const content = Array.from({ length: 5 }, (_, i) => `match ${i}`).join('\n')
    fs.writeFileSync(path.join(rootDir, 'a.md'), content)
    const results = await searchFileContents(rootDir, [{ relPath: 'a.md', size: 50 }], 'match', {})
    expect(results[0].matches).toHaveLength(3)
  })

  it('skips files larger than maxFileSizeBytes without scanning them', async () => {
    fs.writeFileSync(path.join(rootDir, 'big.md'), 'find me')
    const results = await searchFileContents(
      rootDir,
      [{ relPath: 'big.md', size: 10_000_000 }],
      'find me',
      { maxFileSizeBytes: 5_000_000 }
    )
    expect(results).toEqual([{ relPath: 'big.md', skipped: true }])
  })

  it('omits files with no matches from the results entirely', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'nothing relevant')
    const results = await searchFileContents(rootDir, [{ relPath: 'a.md', size: 20 }], 'find me', {})
    expect(results).toEqual([])
  })

  it('throws InvalidRegexError for a malformed pattern', async () => {
    await expect(
      searchFileContents(rootDir, [{ relPath: 'a.md', size: 10 }], '(unclosed', { regex: true })
    ).rejects.toThrow(InvalidRegexError)
  })

  it('throws InvalidRegexError for a query longer than 200 characters', async () => {
    const longQuery = 'a'.repeat(201)
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'some content')
    await expect(
      searchFileContents(rootDir, [{ relPath: 'a.md', size: 20 }], longQuery, { regex: true })
    ).rejects.toThrow(InvalidRegexError)
  })

  it(
    'rejects with RegexTimeoutError when a catastrophic-backtracking pattern is actually run, ' +
      'via worker-thread timeout',
    async () => {
      const worstCase = 'a'.repeat(35) + '!'
      fs.writeFileSync(path.join(rootDir, 'a.md'), worstCase)
      const start = Date.now()
      await expect(
        searchFileContents(rootDir, [{ relPath: 'a.md', size: 100 }], '(a|a)+$', { regex: true })
      ).rejects.toThrow(RegexTimeoutError)
      const elapsedMs = Date.now() - start
      expect(elapsedMs).toBeGreaterThanOrEqual(1900)
      expect(elapsedMs).toBeLessThan(10000)
    },
    10000
  )

  it('does not reject benign patterns with a single group and quantifier', async () => {
    fs.writeFileSync(path.join(rootDir, 'a.md'), 'abcabc')
    await expect(
      searchFileContents(rootDir, [{ relPath: 'a.md', size: 20 }], '(abc)+', { regex: true })
    ).resolves.not.toThrow()
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
