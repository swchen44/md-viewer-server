import { useEffect, useState } from 'react'
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
}

interface OutlinePanelProps {
  activeTab: ActiveTabRef | null
  onJumpToHeading: (line: number) => void
  headingFilter?: HeadingFilter | null
}

function sameTab(a: ActiveTabRef | null, b: ActiveTabRef | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.rootId === b.rootId && a.relPath === b.relPath
}

// Outline search never calls a *file/outline* API for filtering: the headings
// for the active tab are already loaded in memory (fetched once per tab
// below). Plain-text filtering is a simple case-insensitive substring scan —
// no backtracking risk, so it stays synchronous here.
function applyPlainTextFilter(headings: Heading[], query: string): Heading[] {
  const needle = query.toLowerCase()
  return headings.filter((h) => h.text.toLowerCase().includes(needle))
}

export function OutlinePanel({ activeTab, onJumpToHeading, headingFilter }: OutlinePanelProps) {
  const { t } = useTranslation()
  const [headings, setHeadings] = useState<Heading[]>([])
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
    headings: Heading[]
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
    setHeadings([])
    setLoadError(false)
  }

  useEffect(() => {
    if (!activeTab) return
    let cancelled = false
    apiFetch(`/api/outline?root=${activeTab.rootId}&path=${encodeURIComponent(activeTab.relPath)}`)
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setHeadings([])
          setLoadError(true)
          return
        }
        setHeadings(data.headings)
        setLoadError(false)
      })
      .catch(() => {
        if (!cancelled) {
          setHeadings([])
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
      headings.map((h) => h.text),
      { signal: controller.signal }
    )
      .then((matchedIndexes) => {
        if (cancelled) return
        const matched = new Set(matchedIndexes)
        setRegexMatchResult({ query, headings, matches: headings.filter((_, i) => matched.has(i)) })
      })
      .catch(() => {
        // Invalid pattern, worker error, cancellation, or a timed-out
        // pathological pattern — in every case, show no matches rather than
        // crash the panel or leave stale results on screen indefinitely.
        if (!cancelled) setRegexMatchResult({ query, headings, matches: [] })
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [headingFilter, headings])

  if (!activeTab) {
    return <div data-testid="outline-panel">{t('outline.noFileOpen', 'No file open')}</div>
  }

  if (loadError) {
    return (
      <div data-testid="outline-panel">{t('outline.loadError', 'Failed to load outline')}</div>
    )
  }

  const visibleHeadings = (() => {
    if (!headingFilter || !headingFilter.query) return headings
    if (!headingFilter.regex) return applyPlainTextFilter(headings, headingFilter.query)
    const upToDate =
      regexMatchResult &&
      regexMatchResult.query === headingFilter.query &&
      regexMatchResult.headings === headings
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
