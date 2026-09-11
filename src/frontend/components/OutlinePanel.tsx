import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../api-client.js'
import { runOutlineRegexMatch } from '../outline-regex-client.js'

interface Heading {
  level: number
  text: string
  line: number
}

interface ActiveTabRef {
  rootId: number
  relPath: string
}

export interface HeadingFilter {
  query: string
  regex: boolean
  target?: 'title' | 'content' | 'both'
}

interface OutlinePanelProps {
  activeTab: ActiveTabRef | null
  content?: string | null
  onJumpToHeading: (line: number) => void
  headingFilter?: HeadingFilter | null
}

function sameTab(a: ActiveTabRef | null, b: ActiveTabRef | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.rootId === b.rootId && a.relPath === b.relPath
}

// Match buildOutline in src/server/search.js, including its fenced-code rules.
// Current content supplies both headings and section boundaries so edits cannot
// make the display, search results, and jump positions use different snapshots.
function buildHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  let inFence = false
  content.split(/\r?\n/).forEach((line, index) => {
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

// Filtering stays in memory; a query never triggers another file/outline API call.
function buildSectionContents(headings: Heading[], content: string | null | undefined): string[] {
  if (content === null || content === undefined) return headings.map(() => '')
  const lines = content.split(/\r?\n/)
  return headings.map((heading, index) => {
    const start = Math.max(heading.line, 1)
    const nextHeadingLine = headings[index + 1]?.line ?? lines.length + 1
    return lines.slice(start, Math.max(start, nextHeadingLine - 1)).join('\n')
  })
}

function buildSearchTexts(
  headings: Heading[],
  sectionContents: string[],
  target: 'title' | 'content' | 'both'
): { texts: string[]; headingIndexes: number[] } {
  const texts: string[] = []
  const headingIndexes: number[] = []
  headings.forEach((heading, index) => {
    if (target !== 'content') {
      texts.push(heading.text)
      headingIndexes.push(index)
    }
    if (target !== 'title') {
      const lines = (sectionContents[index] ?? '').split(/\r?\n/)
      for (const line of lines) {
        texts.push(line)
        headingIndexes.push(index)
      }
    }
  })
  return { texts, headingIndexes }
}

function applyPlainTextFilter(
  headings: Heading[],
  searchTexts: { texts: string[]; headingIndexes: number[] },
  query: string
): Heading[] {
  const needle = query.toLowerCase()
  const matches = new Set(
    searchTexts.headingIndexes.filter((_, index) =>
      (searchTexts.texts[index] ?? '').toLowerCase().includes(needle)
    )
  )
  return headings.filter((_, index) => matches.has(index))
}

export function OutlinePanel({ activeTab, content, onJumpToHeading, headingFilter }: OutlinePanelProps) {
  const { t } = useTranslation()
  const [fetchedHeadings, setFetchedHeadings] = useState<Heading[]>([])
  const [loadError, setLoadError] = useState(false)
  // Records the result of the most recently *completed* regex match, tagged
  // with the (query, headings) it was computed against. visibleHeadings below
  // only uses it when both still match the current render — otherwise (a new
  // query, a new tab's headings, or a match still in flight) it falls back to
  // the unfiltered headings rather than blanking to "no results" for the
  // duration of the Worker round-trip. This — rather than an explicit "reset
  // to pending" step — is what lets the effect below avoid calling setState
  // synchronously in its body (flagged by this repo's
  // react-hooks/set-state-in-effect lint rule): it only ever calls setState
  // from inside the async .then()/.catch() callbacks once a match completes.
  const [regexMatchResult, setRegexMatchResult] = useState<{
    query: string
    target: 'title' | 'content' | 'both'
    headings: Heading[]
    searchTexts: { texts: string[]; headingIndexes: number[] }
    matches: Heading[]
  } | null>(null)
  // Adjust state during render (React's documented pattern for resetting state when
  // a prop changes) rather than in the effect below, so stale headings from the
  // previous tab are gone before this render commits — not merely once the new
  // fetch resolves. Doing this synchronous setState inside useEffect instead is
  // flagged by this repo's react-hooks/set-state-in-effect lint rule.
  const [prevActiveTab, setPrevActiveTab] = useState(activeTab)
  if (!sameTab(prevActiveTab, activeTab)) {
    setPrevActiveTab(activeTab)
    setFetchedHeadings([])
    setLoadError(false)
  }

  const headings = useMemo(
    () => content == null ? fetchedHeadings : buildHeadings(content),
    [content, fetchedHeadings]
  )
  const sectionContents = useMemo(() => buildSectionContents(headings, content), [headings, content])
  const target = headingFilter?.target ?? 'title'
  const searchTexts = useMemo(
    () => buildSearchTexts(headings, sectionContents, target),
    [headings, sectionContents, target]
  )

  useEffect(() => {
    if (!activeTab) return
    let cancelled = false
    apiFetch(`/api/outline?root=${activeTab.rootId}&path=${encodeURIComponent(activeTab.relPath)}`)
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setFetchedHeadings([])
          setLoadError(true)
          return
        }
        setFetchedHeadings(data.headings)
        setLoadError(false)
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedHeadings([])
          setLoadError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeTab])

  // Bug 3 fix (Codex adversarial review, /codex:adversarial-review --base
  // 0a87e7d, Plan 5 closing review): regex matching used to run synchronously
  // here via `new RegExp(...).test(...)` directly in render, with no
  // protection against a pathological pattern (catastrophic backtracking)
  // hanging the whole browser tab's main thread. It now runs in a dedicated
  // Worker with a hard timeout (see outline-regex-client.ts for the full
  // reasoning) so a hang there can never block this thread.
  useEffect(() => {
    if (!headingFilter || !headingFilter.regex || !headingFilter.query) return
    const query = headingFilter.query
    let cancelled = false
    // A previous in-flight match's Worker must not be left running once this
    // effect re-runs (query keeps changing while typing, or the tab
    // switches) or unmounts — otherwise each abandoned Worker keeps burning
    // CPU for its full timeoutMs even though its result will never be used.
    // Aborting via the controller (rather than only setting `cancelled`)
    // makes runOutlineRegexMatch terminate the Worker immediately.
    const controller = new AbortController()
    runOutlineRegexMatch(
      query,
      searchTexts.texts,
      { signal: controller.signal }
    )
      .then((matchedIndexes) => {
        if (cancelled) return
        const matched = new Set(
          matchedIndexes.map((index) => searchTexts.headingIndexes[index]).filter((index) => index !== undefined)
        )
        setRegexMatchResult({
          query,
          target,
          headings,
          searchTexts,
          matches: headings.filter((_, i) => matched.has(i)),
        })
      })
      .catch(() => {
        // Invalid pattern, worker error, cancellation, or a timed-out
        // pathological pattern — in every case, show no matches rather than
        // crash the panel or leave stale results on screen indefinitely.
        if (!cancelled) setRegexMatchResult({ query, target, headings, searchTexts, matches: [] })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [headingFilter, headings, searchTexts, target])

  if (!activeTab) {
    return <div data-testid="outline-panel">{t('outline.noFileOpen', 'No file open')}</div>
  }

  if (loadError && content == null) {
    return (
      <div data-testid="outline-panel">{t('outline.loadError', 'Failed to load outline')}</div>
    )
  }

  const visibleHeadings = (() => {
    if (!headingFilter || !headingFilter.query) return headings
    if (!headingFilter.regex) return applyPlainTextFilter(headings, searchTexts, headingFilter.query)
    const upToDate =
      regexMatchResult &&
      regexMatchResult.query === headingFilter.query &&
      regexMatchResult.headings === headings &&
      regexMatchResult.target === target &&
      regexMatchResult.searchTexts === searchTexts
    return upToDate ? regexMatchResult.matches : headings
  })()

  return (
    <div data-testid="outline-panel">
      {visibleHeadings.map((h) => (
        <div
          key={h.line}
          onClick={() => onJumpToHeading(h.line)}
          style={{ paddingLeft: (h.level - 1) * 12, cursor: 'pointer' }}
        >
          {h.text}
        </div>
      ))}
    </div>
  )
}
